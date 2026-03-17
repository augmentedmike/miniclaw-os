import * as tls from "node:tls";
import * as net from "node:net";

/**
 * Quick IMAP auth check. Defaults to Gmail IMAP server if no host/port given.
 */
export async function checkImapAuth(
  email: string,
  appPassword: string,
  imapHost: string = "imap.gmail.com",
  imapPort: number = 993
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: imapHost, port: imapPort, servername: imapHost },
      () => {
        let buffer = "";
        let greeted = false;

        socket.on("data", (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split("\r\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!greeted && line.startsWith("* OK")) {
              greeted = true;
              socket.write(`A001 LOGIN "${email}" "${appPassword}"\r\n`);
            } else if (line.startsWith("A001 OK")) {
              socket.destroy();
              resolve({ ok: true });
            } else if (line.startsWith("A001 NO") || line.startsWith("A001 BAD")) {
              socket.destroy();
              resolve({ ok: false, error: "Invalid email or app password" });
            }
          }
        });

        socket.on("error", (err: Error) => {
          resolve({ ok: false, error: `Connection error: ${err.message}` });
        });

        socket.on("timeout", () => {
          socket.destroy();
          resolve({ ok: false, error: "Connection timed out" });
        });

        socket.setTimeout(10000);
      }
    );

    socket.on("error", (err: Error) => {
      resolve({ ok: false, error: `TLS error: ${err.message}` });
    });
  });
}

/**
 * SMTP auth check for non-Gmail accounts.
 * Connects via STARTTLS (port 587) or implicit TLS (port 465).
 */
export async function checkSmtpAuth(
  email: string,
  password: string,
  host: string,
  port: number
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const implicitTls = port === 465;

    const connectAndAuth = (socket: net.Socket | tls.TLSSocket) => {
      let buffer = "";
      let state: "greeting" | "ehlo" | "starttls" | "ehlo2" | "auth" | "creds" | "done" = "greeting";

      const sendLine = (line: string) => socket.write(line + "\r\n");

      const handleLine = (line: string) => {
        const code = parseInt(line.substring(0, 3), 10);
        const isMulti = line[3] === "-";
        if (isMulti) return; // wait for final line

        switch (state) {
          case "greeting":
            if (code === 220) {
              state = implicitTls ? "ehlo" : "ehlo";
              sendLine(`EHLO localhost`);
            } else {
              socket.destroy();
              resolve({ ok: false, error: `Unexpected greeting: ${line}` });
            }
            break;
          case "ehlo":
            if (code === 250) {
              if (implicitTls) {
                state = "auth";
                sendLine("AUTH LOGIN");
              } else {
                state = "starttls";
                sendLine("STARTTLS");
              }
            }
            break;
          case "starttls":
            if (code === 220) {
              // Upgrade to TLS
              const tlsSocket = tls.connect(
                { socket, host, servername: host },
                () => {
                  state = "ehlo2";
                  tlsSocket.write("EHLO localhost\r\n");
                }
              );
              tlsSocket.on("data", (chunk: Buffer) => {
                buffer += chunk.toString();
                const lines = buffer.split("\r\n");
                buffer = lines.pop() || "";
                for (const l of lines) if (l.trim()) handleLine(l);
              });
              tlsSocket.on("error", (err: Error) => {
                resolve({ ok: false, error: `TLS upgrade failed: ${err.message}` });
              });
              return; // stop processing on old socket
            } else {
              socket.destroy();
              resolve({ ok: false, error: "STARTTLS not supported" });
            }
            break;
          case "ehlo2":
            if (code === 250) {
              state = "auth";
              sendLine("AUTH LOGIN");
            }
            break;
          case "auth":
            if (code === 334) {
              state = "creds";
              sendLine(Buffer.from(email).toString("base64"));
            } else {
              socket.destroy();
              resolve({ ok: false, error: "AUTH LOGIN not supported" });
            }
            break;
          case "creds":
            if (code === 334) {
              state = "done";
              sendLine(Buffer.from(password).toString("base64"));
            } else if (code === 235) {
              socket.destroy();
              resolve({ ok: true });
            } else {
              socket.destroy();
              resolve({ ok: false, error: "Invalid credentials" });
            }
            break;
          case "done":
            socket.destroy();
            if (code === 235) {
              resolve({ ok: true });
            } else {
              resolve({ ok: false, error: "Invalid email or password" });
            }
            break;
        }
      };

      socket.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\r\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.trim()) handleLine(line);
        }
      });

      socket.on("error", (err: Error) => {
        resolve({ ok: false, error: `Connection error: ${err.message}` });
      });

      socket.on("timeout", () => {
        socket.destroy();
        resolve({ ok: false, error: "Connection timed out" });
      });

      socket.setTimeout(10000);
    };

    if (implicitTls) {
      const socket = tls.connect({ host, port, servername: host }, () => {
        connectAndAuth(socket);
      });
      socket.on("error", (err: Error) => {
        resolve({ ok: false, error: `TLS error: ${err.message}` });
      });
    } else {
      const socket = net.createConnection({ host, port }, () => {
        connectAndAuth(socket);
      });
      socket.on("error", (err: Error) => {
        resolve({ ok: false, error: `Connection error: ${err.message}` });
      });
    }
  });
}
