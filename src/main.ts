import { parseMM } from "./parser";
import { createMMDB } from "./analyzer";
import { verifyProof } from "./verifier";

declare const CodeMirror: any;

let codeMirror = CodeMirror(document.body, {
    lineNumbers: true,
});

//fetch("/demo0.mm")
//fetch("/big-unifier.mm")
//fetch("/set.mm")
//fetch("/iset.mm")
fetch("/hol.mm")
    .then((response) => response.text())
    .then((text) => {
        //        codeMirror.setValue(text);
        const ast = parseMM(text);
        const db = createMMDB(ast);
        let numCheckedProof = 0;
        let numVerifiedProof = 0;
        for (const [label, frame] of db.extFrames.entries()) {
            if (!frame.proofLabels) {
                continue;
            }
            numCheckedProof++;
            console.log(frame.assertionLabel);
            const verifResult = verifyProof(db, frame);
            if (verifResult === true) {
                numVerifiedProof++;
            } else {
                console.log("verification failed", verifResult);
            }
            console.log("verification result", numVerifiedProof, "/", numCheckedProof);
        }

    });
