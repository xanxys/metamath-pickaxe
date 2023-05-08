type Token = {
    text: string;
    line: number; // 1-origin
};

function tokenize(text: string): Token[] {
    const lines = text.split(/\r?\n/);
    const tokens: Token[] = [];
    let lineIx = 1;
    for (const line of lines) {
        for (const preToken of line.split(/\s+/)) {
            if (preToken.length > 0) {
                tokens.push({ text: preToken, line: lineIx });
            }
        }
        lineIx += 1;
    }
    return tokens;
}

function removeOptionals(tokens: Token[]): Token[] {
    enum State {
        Normal,
        Comment,
    }
    const result: Token[] = [];

    let state = State.Normal;
    for (const token of tokens) {
        if (state === State.Normal) {
            if (token.text === "$(") {
                state = State.Comment;
            } else {
                result.push(token);
            }
        } else if (state === State.Comment) {
            if (token.text === "$)") {
                state = State.Normal;
            }
        }
    }
    return result;
}


function parseMM(text: string) {
    const tokens = removeOptionals(tokenize(text));

    let maxNest = 0;
    let currNest = 0;
    for (const token of tokens) {
        if (token.text === "${") {
            currNest += 1;
            maxNest = Math.max(maxNest, currNest);
        } else if (token.text === "$}") {
            currNest -= 1;
        }
    }
    console.log("maxNest", maxNest);
    //console.log(tokens);
}

declare const CodeMirror: any;

let codeMirror = CodeMirror(document.body, {
    lineNumbers: true,
});


//fetch("/demo0.mm") // maxNest 1
//fetch("/big-unifier.mm") // maxNest 1
//fetch("/set.mm") // maxNest 5
//fetch("/iset.mm") // maxNest 4
fetch("/hol.mm") // maxNest 3
    .then((response) => response.text())
    .then((text) => {
//        codeMirror.setValue(text);
        parseMM(text);
    });
