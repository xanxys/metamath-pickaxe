import 'normalize.css/normalize.css';
import '@blueprintjs/icons/lib/css/blueprint-icons.css';
import '@blueprintjs/core/lib/css/blueprint.css';

import * as React from 'react';
import { useState } from 'react';
import * as ReactDOM from "react-dom/client";
import { Tabs, Tab, Button, Spinner, Card, Elevation, Alert } from "@blueprintjs/core";


import { parseMM } from "./parser";
import { createMMDB, MMDB } from "./analyzer";
import { verifyProof } from "./verifier";

declare const CodeMirror: any;

/*
let codeMirror = CodeMirror(document.body, {
    lineNumbers: true,
});
*/

function MPTopMode(props: any) {
    return <div>
        <h2>Pickaxe</h2>
        <div className="bp4-text-large">
            <p><a href="https://us.metamath.org/">Metamath</a> is a tiny language that can express theorems in
                abstract mathematics, accompanied by proofs that can be verified by a computer program. </p>
            <p>Pickaxe is an unofficial web-based proof assistant.</p>
        </div>
        <div className="bp4-text-muted">
            all data is saved in your browser locally.
        </div>

        <Card interactive={false} elevation={Elevation.ONE}>
            <h2>set.mm</h2>
            <p>ZFC axioms & theorems<br />
                largest metamath DB</p>
            <Button intent="primary" onClick={() => props.selectDb("set.mm")}>Start</Button>
        </Card>

        <Card interactive={false} elevation={Elevation.ONE}>
            <h2>demo0.mm</h2>
            <p>Tutorial DB with a few toy axioms</p>
            <Button intent="primary" onClick={() => props.selectDb("demo0.mm")}>Start</Button>
        </Card>

        <Card interactive={false} elevation={Elevation.ONE}>
            <h2>Others</h2>
            <p>Less-common axionms and local DB files</p>
            <Button>Start</Button>
        </Card>
    </div>;
}

function MPDbMode(props: any) {
    const [dbName, setDbName] = useState("set.mm");
    return <div>
        <h3 onClick={props.onClickBack}>Pickaxe | {dbName} </h3>
        <div style={{ display: "flex" }}>
            <div style={{ flex: "20", display: "flex" }}>
                <Tabs vertical={true} large={true}>
                    <Tab style={{ width: "35px", height: "35px" }} id="db" icon="database" panel={<MPNavigatorDb dbSummary={props.dbSummary} />} />
                    <Tab style={{ width: "35px", height: "35px" }} id="search" icon="search" panel={<MPNavigatorSearch />} />
                </Tabs>
            </div>
            <div style={{ flex: "80" }}>
                Workspace Area
            </div>
        </div>
    </div>
}

function MPNavigatorDb(props: any) {
    return <div>
        {props.dbSummary.text}
    </div>;
}

function MPNavigatorSearch() {
    return <div>
        search here
    </div>;
}

function MPApp() {
    const [isLoading, setIsLoading] = useState(false);
    const [isModeTop, setIsModeTop] = useState(true);
    const [isModeDb, setIsModeDb] = useState(false);
    const [dbSummary, setDbSummary] = useState({});
    const [errorStatus, setErrorStatus] = useState("");

    const handleBack = () => {
        setIsLoading(false);
        setIsModeTop(true);
        setIsModeDb(false);
    };

    const handleSelectDb = async (dbName: string) => {
        console.log("Opening", dbName);
        setIsModeTop(false);
        setIsLoading(true);

        try {
            const db: MMDB = await loadFromGHAndVerify(dbName);

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

            setIsLoading(false);
            setIsModeDb(true);
            setDbSummary({
                text: `${numAxioms} axiom ($a) & ${numCheckedProof} proof ($p) loaded \n proof verification: ${numVerifiedProof} of ${numCheckedProof}`
            });
        } catch (e) {
            setIsLoading(false);
            setIsModeTop(true);
            setErrorStatus(JSON.stringify(e));
        }
    };

    const handleCloseAlert = () => {
        setErrorStatus("");
    };
    return <div>
        {isLoading ? <div><Spinner /> <br />verifying proofs in DB</div> : null}
        <Alert
            isOpen={errorStatus !== ""}
            confirmButtonText="OK"
            canOutsideClickCancel={true}
            onClose={handleCloseAlert}
        >
            <p>
                Couldn't open DB. {errorStatus}
            </p>
        </Alert>
        {isModeTop ? <MPTopMode selectDb={handleSelectDb} /> : null}
        {isModeDb ? <MPDbMode dbSummary={dbSummary} onClickBack={handleBack} /> : null}
    </div>;

    const minorDbs = [
        {
            name: "hol.mm",
            desc: "Higher Order Logic"
        },
        {
            name: "iset.mm",
            desc: "Intuitionistic Set Theory"
        },
        {
            name: "nf.mm",
            desc: "New Foundation"
        }
    ];
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
