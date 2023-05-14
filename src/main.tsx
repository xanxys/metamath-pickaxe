import * as React from 'react';
import * as ReactDOM from "react-dom/client";
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';


import { parseMM } from "./parser";
import { createMMDB } from "./analyzer";
import { verifyProof } from "./verifier";

declare const CodeMirror: any;

let codeMirror = CodeMirror(document.body, {
    lineNumbers: true,
});

function MPApp() {

    const handleClickDemo = () => {
        loadFromGHAndVerify("demo0.mm");
    };

    const handleClickHol = () => {
        loadFromGHAndVerify("hol.mm");
    };

    return <div>
        <Typography variant="h3" gutterBottom>
            Open DBs in GitHub
        </Typography>
        <Button variant="contained" sx={{ textTransform: 'none' }} onClick={handleClickDemo}>demo0.mm</Button>
        <Button variant="contained" sx={{ textTransform: 'none' }} onClick={handleClickHol}>hol.mm</Button>
    </div>;
}

ReactDOM.createRoot(document.querySelector("#app")!).render(
    <React.StrictMode>
        <MPApp />
    </React.StrictMode>
);

function loadFromGHAndVerify(filename: string) {
    //"demo0.mm"
    //"set.mm"
    //"iset.mm"
    //"hol.mm"
    //"miu.mm"
    //"nf.mm"
    //"peano.mm"
    //"ql.mm"
    //"big-unifier.mm"
    fetch("https://raw.githubusercontent.com/metamath/set.mm/master/" + filename)
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
}
