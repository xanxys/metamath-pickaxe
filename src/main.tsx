import 'normalize.css/normalize.css';
import '@blueprintjs/icons/lib/css/blueprint-icons.css';
import '@blueprintjs/core/lib/css/blueprint.css';

import * as React from 'react';
import { useState } from 'react';
import * as ReactDOM from "react-dom/client";
import { Button } from "@blueprintjs/core";


import { parseMM } from "./parser";
import { createMMDB } from "./analyzer";
import { verifyProof } from "./verifier";

declare const CodeMirror: any;

let codeMirror = CodeMirror(document.body, {
    lineNumbers: true,
});

function MPApp() {
    const [status, setStatus] = useState("DB not loaded");

    const handleClickLoad = async (filename: string) => {
        const res = await loadFromGHAndVerify(filename);
        setStatus("DB loaded: " + res);
    };

    return <div>
        <h3 className="bp4-heading">Standard DBs</h3>
        master branch of https://github.com/metamath/set.mm <br />
        <Button intent="primary" text="demo0.mm" onClick={() => handleClickLoad("demo0.mm")} />
        <Button intent="primary" text="hol.mm" onClick={() => handleClickLoad("hol.mm")} />

        {status}
    </div>;
}

ReactDOM.createRoot(document.querySelector("#app")!).render(
    <React.StrictMode>
        <MPApp />
    </React.StrictMode>
);

async function loadFromGHAndVerify(filename: string): Promise<string> {
    //"demo0.mm"
    //"set.mm"
    //"iset.mm"
    //"hol.mm"
    //"miu.mm"
    //"nf.mm"
    //"peano.mm"
    //"ql.mm"
    //"big-unifier.mm"
    return fetch("https://raw.githubusercontent.com/metamath/set.mm/master/" + filename)
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
            return `"verification result ${numVerifiedProof} of ${numCheckedProof}`;
        });
}
