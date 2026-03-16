# Coding Axioms

Rules for writing code in this project. Language-independent unless noted.

**Caveats — these override any axiom:**
- When an axiom conflicts with a language's idioms, **idiomatic code wins.**
- When a declarative/functional approach causes measurable slowness, a small imperative escape is fine.
- These axioms are defaults, not dogma. Use judgment.

---

## 1. Fail loudly, not gracefully

A clean failure surfaces the real problem. A confident-sounding fallback buries it.
No default values that mask missing data. No silent catches. No graceful degradation
to a plausible guess. If something is wrong, the code should scream — not whisper
a wrong answer.

```ts
// wrong
const botId = config.botId ?? "default-bot";

// right
if (!config.botId) throw new Error("botId not configured");
```

## 2. Three lines > one abstraction

Don't extract a helper for something that happens once. Don't create a utility
module for a one-off operation. Three similar lines of code is better than a
premature abstraction. If you find yourself writing the same thing a fourth time,
then extract.

## 3. Don't build for hypothetical futures

Solve the problem in front of you. No feature flags for features that don't exist.
No backwards-compatibility shims for callers that don't exist. No config options
for variations nobody asked for. The right amount of complexity is the minimum
needed for the current task.

## 4. Deterministic beats probabilistic

Every piece of logic in a tested tool is a hallucination that can never happen.
If behavior can be codified into a function with known inputs and outputs, do that.
Don't leave it to runtime inference, string matching, or pattern guessing.

## 5. Declarative over imperative

Say *what*, not *how*. Prefer pure functions, immutable data, composition, and
declarative patterns. SQL over manual loops through rows. `map`/`filter` over
index tracking. Config over code when the behavior is static.

But not religiously. A `for` loop that's clear and fast beats a `reduce` chain
that allocates needlessly. When declarative causes measurable slowness, a small
imperative escape is fine — just keep it contained.

```ts
// fine — functional is clearer here
const names = users.filter(u => u.active).map(u => u.name);

// also fine — imperative is faster and clearer for mutation
for (const row of rows) {
  db.prepare("INSERT INTO t VALUES (?)").run(row.id);
}
```

## 6. Idiomatic code wins

Don't force patterns from one language into another. Go doesn't need monads.
Python doesn't need Java-style interfaces. TypeScript doesn't need Hungarian
notation. Write code that a senior engineer in that language would recognize
as natural.

## 7. No over-engineering

Don't add features, refactor code, or make "improvements" beyond what was asked.
A bug fix doesn't need surrounding code cleaned up. A simple feature doesn't need
extra configurability. Don't add docstrings, comments, or type annotations to
code you didn't change. Only add comments where the logic isn't self-evident.

## 8. Validate at boundaries, trust internally

Only validate at system boundaries — user input, external APIs, file I/O.
Don't add runtime checks for impossible states inside your own code. If a
function receives a type, trust the type. Don't re-validate what the caller
already guaranteed.

## 9. Composition over inheritance

Small functions that compose beat class hierarchies. Pipes beat orchestrators.
A tool that does one thing and exits beats a framework that does everything
and never finishes.

## 10. Delete, don't deprecate

If something is unused, delete it. No `// removed` comments. No `_unused`
renames. No re-exports for backwards compatibility with zero callers.
Git has history. Use it.

## 11. Tests prove behavior, not coverage

Write tests that would catch real bugs. Don't write tests to hit a coverage
number. A single integration test that exercises the real path is worth more
than ten unit tests that mock everything.

## 12. Error messages are UI

Error messages are read by humans. Make them specific, actionable, and short.
Include what went wrong, what was expected, and what to do about it.

```
// wrong
Error: invalid input

// right
Error: botId not found in openclaw.json — run the setup wizard at http://localhost:4210
```

## 13. Naming is the only documentation that stays current

Good names eliminate the need for comments. If a function needs a comment to
explain what it does, rename the function. If a variable needs a comment to
explain what it holds, rename the variable.

## 14. Side effects at the edges

Keep the core logic pure. Push I/O, database calls, and network requests to
the edges of the call stack. The function that decides what to do should not
be the function that does it.

## 15. Explicit over implicit

No magic. No action at a distance. No global state that changes behavior
based on who imported what. If a function needs something, pass it in.
If a module has a dependency, import it. If a behavior changes based on
a condition, the condition should be visible at the call site.

## 16. No DSLs for DSLs' sake

A DSL is justified when it compresses a domain into something genuinely
simpler. Most DSLs just move complexity from code you can debug into syntax
you can't. If the DSL doesn't save significant cognitive load over plain
code in the host language, skip it. Configuration files are fine. Inventing
a grammar is almost never fine.

## 17. Runtime decoration is evil

Decorators, monkey-patching, runtime class mutation, aspect-oriented
injection — anything that changes what code does without changing what code
says. If you read a function and it does X, it should do X. Not X-plus-
whatever-some-decorator-injected-at-import-time. Dynamic dispatch is fine.
Metaprogramming that rewrites behavior behind your back is not.

```python
# evil — what does this function actually do? depends on what @thing does
@log_calls
@retry(3)
@cache(ttl=60)
def get_user(id): ...

# fine — explicit, readable, debuggable
def get_user(id):
    user = db.query("SELECT * FROM users WHERE id = ?", id)
    if not user:
        raise NotFoundError(f"user {id}")
    return user
```

---

## References

These axioms didn't come from nowhere. If you want to understand the thinking behind them:

- **The Art of Unix Programming** — Eric S. Raymond. The original case for composition, small tools, text streams, and doing one thing well. Most of these axioms are Unix philosophy applied to modern code.
- **Structure and Interpretation of Computer Programs** — Abelson & Sussman. The book that teaches you to think about computation, not just syntax. Composition, abstraction boundaries, side effects at the edges — it's all here.
- **A Philosophy of Software Design** — John Ousterhout. The best modern argument against complexity creep. Deep modules, strategic vs tactical programming, why most abstractions make things worse.
- **Designing Data-Intensive Applications** — Martin Kleppmann. How to think about data flow, system boundaries, and failure modes. The "validate at boundaries" and "deterministic beats probabilistic" axioms live here.
- **The Mythical Man-Month** — Fred Brooks. "No silver bullet." Why adding complexity doesn't solve problems and why the simplest thing that works is usually the right thing.
- **Out of the Tar Pit** — Ben Moseley & Peter Marks. The paper that makes the case against accidental complexity and for separating state, logic, and control. Free online.
- **Worse Is Better** — Richard P. Gabriel. The essay that explains why Unix beat Lisp — simplicity of implementation over correctness of interface. Controversial and correct.
