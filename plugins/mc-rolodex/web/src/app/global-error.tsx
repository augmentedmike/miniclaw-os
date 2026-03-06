"use client";
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html>
      <body>
        <p>Something went wrong.</p>
        <button onClick={reset}>Try again</button>
      </body>
    </html>
  );
}
