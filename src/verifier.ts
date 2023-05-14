import { MMDB, ExtFrame, DVRestriction } from "./analyzer";

// Compressed proof is not just compression of label list, it's extension of stack machine operation to allow memory access.
// read discussion in https://groups.google.com/g/metamath/c/qIHf2h0fxbA
type ProofStackOp = {
    ty: ProofStackOpType,
    pushLabel: string | undefined,
    memoryIx: number | undefined,
};

enum ProofStackOpType {
    Push,
    Store,
    Load,
};

function decodeNormalProof(labels: string[]): ProofStackOp[] {
    const result: ProofStackOp[] = [];
    for (const label of labels) {
        result.push({
            ty: ProofStackOpType.Push,
            pushLabel: label,
            memoryIx: undefined,
        });
    }
    return result;
}

function decodeCompressedProof(compressedProof: (number | "Z")[], mandatoryHypLabels: string[], optionalLabels: string[]): ProofStackOp[] {
    const result: ProofStackOp[] = [];
    let memoryIx = 0;
    for (const rawOp of compressedProof) {
        if (rawOp === "Z") {
            result.push({
                ty: ProofStackOpType.Store,
                pushLabel: undefined,
                memoryIx: memoryIx,
            });
            memoryIx++;
        } else {
            const num = rawOp;
            if (num < mandatoryHypLabels.length) {
                result.push({
                    ty: ProofStackOpType.Push,
                    pushLabel: mandatoryHypLabels[num],
                    memoryIx: undefined,
                });
            } else if (num < mandatoryHypLabels.length + optionalLabels.length) {
                result.push({
                    ty: ProofStackOpType.Push,
                    pushLabel: optionalLabels[num - mandatoryHypLabels.length],
                    memoryIx: undefined,
                });
            } else {
                const loadIx = num - mandatoryHypLabels.length - optionalLabels.length;
                if (loadIx >= memoryIx) {
                    throw new Error("Invalid compressed proof (referencing undefined subproof)");
                }
                result.push({
                    ty: ProofStackOpType.Load,
                    pushLabel: undefined,
                    memoryIx: loadIx,
                });
            }
        }
    }
    return result;
}

function symSeqEqual(symSeqA: string[], symSeqB: string[]): boolean {
    if (symSeqA.length !== symSeqB.length) {
        return false;
    }
    for (let i = 0; i < symSeqA.length; i++) {
        if (symSeqA[i] !== symSeqB[i]) {
            return false;
        }
    }
    return true;
}

// Very simple unifier that only processes contraints from front-to-back, in greedy matching. (no backtracking)
// Metamath proof semantics is designed such that this kind of unifier always works.
class SimpleUnifier {
    unifier: Map<string, string[]> = new Map();  // key: variable, value: symbol sequence (value can be empty seq)
    consts: Set<string>;

    // consts are consts, and all other symbols are variables (target of unification).
    constructor(consts: Set<string>) {
        this.consts = consts;
    }

    // Constrain this unification to satisfy: this.apply(from) === to
    addConstraint(from: string[], to: string[]): true | string {
        for (const fromSym of from) {
            // const case
            if (this.consts.has(fromSym)) {
                if (to.length === 0) {
                    return `could not match symbol "${fromSym}" (const) to empty sequence`;
                }
                if (to[0] !== fromSym) {
                    return `could not match symbol "${fromSym}" (const) to "${to[0]}" (const)`;
                }
                // ok
                to = to.slice(1);
                continue;
            }

            // var case (already unified)
            const unif = this.unifier.get(fromSym);
            if (unif !== undefined) {
                if (!symSeqEqual(unif, to.slice(0, unif.length))) {
                    return `for" ${fromSym}" (var), contradictinon found 1. ${unif} 2. ${to.slice(0, unif.length)}`;
                }
                // ok
                to = to.slice(unif.length);
                continue;
            }

            // var case (not unified yet) : greedy match
            this.unifier.set(fromSym, to);
            to = [];
        }
        if (to.length > 0) {
            return `could not match empty sequence to "${to}"`;
        }
        return true;
    }

    // Replaces each variable in symSeq to symbol sequences, that satisfies all previous addConstraint() calls.
    apply(symSeq: string[]): string[] {
        const result: string[] = [];
        for (const sym of symSeq) {
            if (this.consts.has(sym)) {
                result.push(sym);
            } else {
                const u = this.unifier.get(sym);
                if (u === undefined) {
                    throw new Error(`Unification failed for ${sym}. Probably caller's bug.`);
                }
                result.push(...u);
            }
        }
        return result;
    }

    applyToDvr(dvr: DVRestriction): DVRestriction {
        const unifierVarOnly: Map<string, string[]> = new Map();
        for (const [k, syms] of this.unifier) {
            unifierVarOnly.set(k, syms.filter((sym) => !this.consts.has(sym)));
        }
        return dvr.substituteMultiple(unifierVarOnly);
    }
}

// Returns true is the proof is valid, otherwise failure reason string.
export function verifyProof(db: MMDB, frame: ExtFrame): true | string {
    if (!frame.proofLabels) {
        throw new Error("frame must contain a proof");
    }

    let decodedOps: ProofStackOp[] = [];
    if (!frame.proofCompressed) {
        decodedOps = decodeNormalProof(frame.proofLabels);
    } else {
        decodedOps = decodeCompressedProof(frame.proofCompressed, frame.mandatoryHyps.map((h) => h.label), frame.proofLabels);
    }

    const memory: Map<number, string[]> = new Map();
    const stack: string[][] = [];
    for (const op of decodedOps) {
        if (op.ty === ProofStackOpType.Store) {
            memory.set(op.memoryIx as number, stack[stack.length - 1]);
            continue;
        }
        if (op.ty === ProofStackOpType.Load) {
            stack.push(memory.get(op.memoryIx as number) as string[]);
            continue;
        }

        const label: string = op.pushLabel as string;
        var hyp = frame.context.hyps.filter((h) => h.label === label)[0];
        if (hyp) {
            stack.push([hyp.typecode, ...hyp.symbols]);
            continue;
        }

        const assertion = db.extFrames.get(label);
        if (assertion) {
            const arity = assertion.mandatoryHyps.length;
            if (stack.length < arity) {
                return `Assertion "${assertion.assertionLabel}" requires ${arity} arguments, but only ${stack.length} arguments are available in proof stack.`;
            }
            const args = stack.splice(-arity, arity);

            const unifier = new SimpleUnifier(db.constSymbols);
            for (let i = 0; i < arity; i++) {
                const hyp = assertion.mandatoryHyps[i];
                const res = unifier.addConstraint([hyp.typecode, ...hyp.symbols], args[i]);
                if (res !== true) {
                    return `Unification failed: ${res}`;
                }
            }
            if (!unifier.applyToDvr(assertion.mandatoryDvr).satisfiedBy(frame.context.dvr)) {
                return `Disjointness requirement of referenced assertion ${assertion.assertionLabel} is not satisfied by proof context`;
            }
            stack.push(unifier.apply([assertion.assertionTypecode, ...assertion.assertionSymbols]));
            continue;
        }

        throw new Error(`Invalid frame, missing ${label}`);  // analyzer should prevent this from happening.
    }

    if (stack.length !== 1) {
        return `Excess or missing proof steps; stack size is ${stack.length} (must be 1)`;
    }
    if (!symSeqEqual(stack[0], [frame.assertionTypecode, ...frame.assertionSymbols])) {
        return `Proven symbol sequence "${stack[0]}" does not match assertion "${frame.assertionSymbols}"`;
    }

    return true;
}
