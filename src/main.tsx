import 'normalize.css/normalize.css';
import '@blueprintjs/icons/lib/css/blueprint-icons.css';
import '@blueprintjs/core/lib/css/blueprint.css';

import * as React from 'react';
import { useState } from 'react';
import * as ReactDOM from "react-dom/client";
import { Button } from "@blueprintjs/core";


import { parseMM } from "./parser";
import { createMMDB, MMDB } from "./analyzer";
import { verifyProof } from "./verifier";

declare const CodeMirror: any;

let codeMirror = CodeMirror(document.body, {
    lineNumbers: true,
});

function MPApp() {
    const [status, setStatus] = useState("DB not loaded");

    const handleClickLoad = async (filename: string) => {
        try {
            const db: MMDB = await loadFromGHAndVerify(filename);

            let numAxioms = 0;
            let numCheckedProof = 0;
            let numVerifiedProof = 0;
            for (const [label, frame] of db.extFrames.entries()) {
                if (!frame.proofLabels) {
                    numAxioms++;
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
            setStatus(`DB loaded: \n ${numAxioms} axiom ($a) & ${numCheckedProof} proof ($p) loaded \n proof verification: ${numVerifiedProof} of ${numCheckedProof}`);
        } catch (e) {
            setStatus(`DB load error: \n ${JSON.stringify(e)}`);
        }
    };

    const filenames = [
        "demo0.mm",
        "set.mm",
        "iset.mm",
        "hol.mm",
        "miu.mm",
        "nf.mm",
        "peano.mm",
        "ql.mm",
        "big-unifier.mm"]

    return <div>
        <h3 className="bp4-heading">Standard DBs</h3>
        master branch of https://github.com/metamath/set.mm <br />
        {filenames.map(filename =>
            <Button
                key={filename}
                intent="primary"
                text={filename}
                onClick={() => handleClickLoad(filename)}
            />
        )}

        {status}
    </div>;
}

ReactDOM.createRoot(document.querySelector("#app")!).render(
    <React.StrictMode>
        <MPApp />
    </React.StrictMode>
);

async function loadFromGHAndVerify(filename: string): Promise<MMDB> {

    return fetch("https://raw.githubusercontent.com/metamath/set.mm/master/" + filename)
        .then((response) => response.text())
        .then((text) => {
            const ast = parseMM(text);
            const db = createMMDB(ast);
            return db;
        });
}
