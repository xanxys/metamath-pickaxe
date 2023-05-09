import { parseMM, DStmt, FStmt, EStmt, MMBlock, EntryType, CStmt, VStmt, AStmt, PStmt } from "./parser";

type ExtFrame = {
    disjoints: DStmt[],
    varHyps: FStmt[],
    logiHyps: EStmt[],

    assertionLabel: string,
    assertionTypecode: string,
    assertionSymbols: string[],
    assertionLine: number,

    optionalDisjoints: DStmt[],
    optionalVarHyps: FStmt[],
    proofLabels: string[] | null,
    proofCompressed: string | null,
};

// See p.132 of metamath.pdf
type MMDB = {
    constSymbols: Set<string>,
    varSymbols: Set<String>,
    extFrames: Map<string, ExtFrame>, // key is label
};

// Input data error at AST level.
class ASTError {
    line: number;
    message: string;

    constructor(line: number, message: string) {
        this.line = line;
        this.message = message;
    }
}

// throws ASTError.
function organizeMM(outermostBlock: MMBlock): MMDB {
    const db: MMDB = {
        constSymbols: new Set(),
        varSymbols: new Set(),
        extFrames: new Map(),
    };

    function procBlock(block: MMBlock, outermost: boolean) {
        let currFrame: ExtFrame = {
            disjoints: [],
            varHyps: [],
            logiHyps: [],
            assertionLabel: "",
            assertionTypecode: "",
            assertionSymbols: [],
            assertionLine: 0,
            optionalDisjoints: [],
            optionalVarHyps: [],
            proofLabels: null,
            proofCompressed: null,
        };

        for (const ent of block.entries) {
            if (ent.entryTy === EntryType.CS) {
                const stmt = ent.stmt as CStmt;
                if (!outermost) {
                    throw new ASTError(stmt.declLine, "$c can only appear in the outermost block");
                }
                stmt.symbols.forEach((s) => db.constSymbols.add(s));
            } else if (ent.entryTy === EntryType.VS) {
                const stmt = ent.stmt as VStmt;
                stmt.symbols.forEach((s) => db.varSymbols.add(s));
            } else if (ent.entryTy === EntryType.FS) {
                const stmt = ent.stmt as FStmt;
                currFrame.varHyps.push(stmt);
            } else if (ent.entryTy === EntryType.ES) {
                const stmt = ent.stmt as EStmt;
                currFrame.logiHyps.push(stmt);
            } else if (ent.entryTy === EntryType.DS) {
                const stmt = ent.stmt as DStmt;
                currFrame.disjoints.push(stmt);
            } else if (ent.entryTy === EntryType.AS) {
                const stmt = ent.stmt as AStmt;
                currFrame.assertionLabel = stmt.label;
                currFrame.assertionLine = stmt.declLine;
                currFrame.assertionTypecode = stmt.typecode;
                currFrame.assertionSymbols = stmt.symbols;
                db.extFrames.set(stmt.label, currFrame);

                currFrame = {
                    disjoints: [],
                    varHyps: [],
                    logiHyps: [],
                    assertionLabel: "",
                    assertionTypecode: "",
                    assertionSymbols: [],
                    assertionLine: 0,
                    optionalDisjoints: [],
                    optionalVarHyps: [],
                    proofLabels: null,
                    proofCompressed: null,
                };
            } else if (ent.entryTy === EntryType.PS) {
                const stmt = ent.stmt as PStmt;
                currFrame.assertionLabel = stmt.label;
                currFrame.assertionLine = stmt.declLine;
                currFrame.assertionTypecode = stmt.typecode;
                currFrame.assertionSymbols = stmt.symbols;

                currFrame.proofLabels = stmt.proofLabels;
                currFrame.proofCompressed = stmt.proofCompressed;
                db.extFrames.set(stmt.label, currFrame);

                currFrame = {
                    disjoints: [],
                    varHyps: [],
                    logiHyps: [],
                    assertionLabel: "",
                    assertionTypecode: "",
                    assertionSymbols: [],
                    assertionLine: 0,
                    optionalDisjoints: [],
                    optionalVarHyps: [],
                    proofLabels: null,
                    proofCompressed: null,
                };
            } else if (ent.entryTy === EntryType.Block) {
                procBlock(ent.block as MMBlock, false);
            } else {
                console.log("Not implemented", ent);
                throw new Error("Not implemented: " + ent.entryTy);
            }
        }
    }

    procBlock(outermostBlock, true);
    return db;
}

// Returns true is the proof is valid.
function verifyProof(db: MMDB, frame: ExtFrame) : boolean {
    if (!frame.proofLabels) {
        throw new Error("frame must contain a proof");
    }

    return false;
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
        const ast = parseMM(text);
        const db = organizeMM(ast);
        for (const [label, frame] of db.extFrames.entries()) {
            if (!frame.proofLabels) {
                continue;
            }
            console.log(label, frame, verifyProof(db, frame));
        }
    });
