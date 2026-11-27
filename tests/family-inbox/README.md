Tests for the Family inbox design (run on the Firestore emulator, never on live data).
- logic.test.js: runs the real import/overlay code extracted from index.src.html and family.html against a local copy of the data document (put it at /tmp/emu/main_copy.json; not committed, it is private data). Needs the emulator with open rules.
- rules.test.js: tests firestore.rules (stage 3 rules, not live).
Run: firebase emulators:exec --only firestore --project demo-test "node logic.test.js"
