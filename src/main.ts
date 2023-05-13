import { parseMM } from "./parser";
import { createMMDB } from "./analyzer";
import { verifyProof } from "./verifier";

declare const CodeMirror: any;

let codeMirror = CodeMirror(document.body, {
    lineNumbers: true,
});


//"demo0.mm"
//"set.mm"
//"iset.mm"
//"hol.mm"
//"miu.mm"
//"nf.mm"
//"peano.mm"
//"ql.mm"
//"big-unifier.mm"
fetch("https://raw.githubusercontent.com/metamath/set.mm/master/hol.mm")
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
