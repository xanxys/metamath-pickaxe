import { parseMM } from "./parser";
import { createMMDB, verifyProof } from "./verifier";

declare const CodeMirror: any;

let codeMirror = CodeMirror(document.body, {
    lineNumbers: true,
});

//fetch("/demo0.mm") // maxNest 1
//fetch("/big-unifier.mm") // maxNest 1
//fetch("/set.mm") // maxNest 5
    fetch("/iset.mm") // maxNest 4
    //fetch("/hol.mm") // maxNest 3
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
            }
            console.log("verification result", numVerifiedProof, "/", numCheckedProof);
        }

    });
