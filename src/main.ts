import { parseMM, DStmt, FStmt, EStmt, MMBlock, EntryType, CStmt, VStmt, AStmt, PStmt } from "./parser";

type FrameContext = {
    disjoints: DStmt[],
    varHyps: FStmt[],
    logiHyps: EStmt[],
};

function cloneFrameContext(ctx: FrameContext): FrameContext {
    return {
        disjoints: Array.from(ctx.disjoints),
        varHyps: Array.from(ctx.varHyps),
        logiHyps: Array.from(ctx.logiHyps),
    };
}

type ExtFrame = {
    context: FrameContext,

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

    function procBlock(block: MMBlock, outermost: boolean, outerCtx: FrameContext) {
        let currCtx = cloneFrameContext(outerCtx);

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
                currCtx.varHyps.push(stmt);
            } else if (ent.entryTy === EntryType.ES) {
                const stmt = ent.stmt as EStmt;
                currCtx.logiHyps.push(stmt);
            } else if (ent.entryTy === EntryType.DS) {
                const stmt = ent.stmt as DStmt;
                currCtx.disjoints.push(stmt);
            } else if (ent.entryTy === EntryType.AS) {
                const stmt = ent.stmt as AStmt;
                db.extFrames.set(stmt.label, {
                    context: cloneFrameContext(currCtx),
                    assertionLabel: stmt.label,
                    assertionLine: stmt.declLine,
                    assertionTypecode: stmt.typecode,
                    assertionSymbols: stmt.symbols,
                    optionalDisjoints: [],
                    optionalVarHyps: [],
                    proofLabels: null,
                    proofCompressed: null,
                });
            } else if (ent.entryTy === EntryType.PS) {
                const stmt = ent.stmt as PStmt;
                db.extFrames.set(stmt.label, {
                    context: cloneFrameContext(currCtx),
                    assertionLabel: stmt.label,
                    assertionLine: stmt.declLine,
                    assertionTypecode: stmt.typecode,
                    assertionSymbols: stmt.symbols,
                    optionalDisjoints: [],
                    optionalVarHyps: [],
                    proofLabels: stmt.proofLabels,
                    proofCompressed: stmt.proofCompressed,
                });
            } else if (ent.entryTy === EntryType.Block) {
                procBlock(ent.block as MMBlock, false, currCtx);
            } else {
                console.log("Not implemented", ent);
                throw new Error("Not implemented: " + ent.entryTy);
            }
        }
    }

    procBlock(outermostBlock, true, {
        disjoints: [],
        varHyps: [],
        logiHyps: [],
    });
    return db;
}

function printStack(stack: any[]) {
    console.log("====stack", ...stack);
}

// Returns true is the proof is valid.
function verifyProof(db: MMDB, frame: ExtFrame): boolean {
    if (!frame.proofLabels) {
        throw new Error("frame must contain a proof");
    }

    const stack: any[] = [];
    for (const label of frame.proofLabels) {
        const varHyp = frame.context.varHyps.filter((h) => h.label === label)[0];
        printStack(stack);
        console.log("applying", label);
        if (varHyp) {
            console.log("ref-var-hyp", varHyp);
            stack.push([varHyp.typecode, varHyp.symbol]);
            continue;
        }
        const logiHyp = frame.context.logiHyps.filter((h) => h.label === label)[0];
        if (logiHyp) {
            console.log("ref-logi-hyp", logiHyp);
            stack.push([logiHyp.typecode, ...logiHyp.symbols]);
            continue;
        }
        const assertion = db.extFrames.get(label);
        if (assertion) {
            console.log("ref-assertion", assertion);
            console.log("Mand hypotheses", assertion.context);
            // TODO: this is currently all hypothesis, not mandatory hypos.
            // need to trim down to mandatory hypothesis before trying to apply unification.
            stack.push([assertion.assertionTypecode, ...assertion.assertionSymbols]);
            continue;
        }

        throw new Error(`Invalid frame, missing ${label}`);
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
            console.log("ExtFrame", label, frame);
            if (!frame.proofLabels) {
                continue;
            }
            console.log("->", verifyProof(db, frame));
        }
    });
