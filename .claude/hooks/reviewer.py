#!/usr/bin/env python3
"""
stop-hook review loop for claude code.

fires every time claude tries to stop. sends the target file to each
reviewer model via openrouter. if every reviewer replies APPROVED,
claude is allowed to stop. otherwise the critiques are fed back to
claude (exit code 2) and it keeps revising.

safety: hard round cap via a counter file (.round). the counter
auto-resets on approval or when the cap is hit.

requires: OPENROUTER_API_KEY in the environment claude code was
launched from. stdlib only, no pip installs.
"""

import json
import os
import pathlib
import sys
import urllib.request

HOOK_DIR = pathlib.Path(__file__).resolve().parent
CONFIG_PATH = HOOK_DIR / "loop-config.json"
COUNTER_PATH = HOOK_DIR / ".round"
API_URL = "https://openrouter.ai/api/v1/chat/completions"


def log(msg: str) -> None:
    # goes to claude when we exit 2; harmless otherwise
    print(msg, file=sys.stderr)


def call_reviewer(model: str, rubric: str, document: str, api_key: str) -> str:
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": (
                    rubric
                    + "\n\nrespond in one of exactly two ways:\n"
                    "1. if the document has no remaining issues worth fixing, "
                    "reply with the single word: APPROVED\n"
                    "2. otherwise, reply with a numbered list of concrete, "
                    "actionable issues. quote the offending text where possible. "
                    "do not include praise or summary — issues only."
                ),
            },
            {"role": "user", "content": document},
        ],
        "temperature": 0.2,
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        body = json.load(resp)
    return body["choices"][0]["message"]["content"].strip()


def main() -> None:
    # read hook input so the pipe doesn't block
    try:
        json.load(sys.stdin)
    except Exception:
        pass

    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        # never trap claude in a loop we can't evaluate
        sys.exit(0)

    config = json.loads(CONFIG_PATH.read_text())
    max_rounds = int(config.get("max_rounds", 3))

    rounds = 0
    if COUNTER_PATH.exists():
        try:
            rounds = int(COUNTER_PATH.read_text().strip())
        except ValueError:
            rounds = 0

    if rounds >= max_rounds:
        COUNTER_PATH.unlink(missing_ok=True)
        log(f"review loop: hit max_rounds ({max_rounds}), allowing stop.")
        sys.exit(0)

    target = pathlib.Path(config["target_file"])
    if not target.exists():
        # nothing to review (normal chat / code task) — let claude stop
        sys.exit(0)

    document = target.read_text()

    critiques = []
    for reviewer in config["reviewers"]:
        try:
            verdict = call_reviewer(
                reviewer["model"], reviewer["rubric"], document, api_key
            )
        except Exception as exc:
            # reviewer unreachable — don't block claude on infra errors
            log(f"review loop: {reviewer['name']} failed ({exc}), skipping.")
            continue
        if verdict.upper().startswith("APPROVED"):
            continue
        critiques.append(f"--- {reviewer['name']} ({reviewer['model']}) ---\n{verdict}")

    if not critiques:
        COUNTER_PATH.unlink(missing_ok=True)
        print("review loop: all reviewers approved.")
        sys.exit(0)

    COUNTER_PATH.write_text(str(rounds + 1))
    log(
        f"review round {rounds + 1}/{max_rounds}: reviewers found issues in "
        f"{target}. address every issue below by editing the file, then stop "
        f"again for re-review. if an issue is factually wrong, add a brief "
        f"rebuttal note at the bottom of the file instead of changing the text.\n\n"
        + "\n\n".join(critiques)
    )
    sys.exit(2)


if __name__ == "__main__":
    main()
