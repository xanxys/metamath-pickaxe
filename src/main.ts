import { parseMM, DStmt, FStmt, EStmt, Token, MMBlock } from "./parser";

type ExtFrame = {
    disjoints: DStmt[],
    varHyps: FStmt[],
    LogiHyps: EStmt[],

    assertionLabel: string,
    assertionSymbs: string[],
    assertionLine: number,

    optionalDisjoints: DStmt[],
    optionalVarHyps: FStmt[],
    proof: any,
};

// See p.132 of metamath.pdf
type MMDB = {
    mathSymbols: Map<string, Token>, // key is symbol
    varHyps: Map<string, FStmt>, // key is label
    extFrames: Map<string, ExtFrame>, // key is label
};

function organizeMM(outermostBlock: MMBlock): MMDB {
    const db: MMDB = {
        mathSymbols: new Map(),
        varHyps: new Map(),
        extFrames: new Map(),

    };
    return db;
}

declare const CodeMirror: any;

let codeMirror = CodeMirror(document.body, {
    lineNumbers: true,
});


fetch("/demo0.mm") // maxNest 1
    //fetch("/big-unifier.mm") // maxNest 1
    //fetch("/set.mm") // maxNest 5
    //fetch("/iset.mm") // maxNest 4
    //fetch("/hol.mm") // maxNest 3
    .then((response) => response.text())
    .then((text) => {
        //        codeMirror.setValue(text);
        console.log(parseMM(text));
    });
