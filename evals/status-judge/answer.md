## Your answer

Write exactly one line for each check in `<checks>`, in the order `<checks>` gives, and nothing else:

```text
<check id> | pass | <the fact the verdict rests on>
<check id> | fail | <the fact the verdict rests on>
<check id> | n/a | <what the page lacks>
```

- Use each check id exactly as `<checks>` gives it, once.
- For a fail, quote the page's words in double quotes, then give the fact they break, in the facts' words. When a check fails in more than one place, name the clearest one.
- For a pass, give the fact the pass rests on, in a few words.
- For `n/a`, say what the page lacks, such as `no child rows`. Use `n/a` only where "The checks" allows it.
- Keep each verdict on one line. Write no other line that starts with a check id and `|`.

For example:

```text
head | pass | Focus now: adding two-factor sign-in, which the head names
marks | fail | "● 3.0 release" while the facts say 3.0 release: delivered
```
