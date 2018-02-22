import XmlDataBlock from './xmlDataBlock';

export default class RemoteDataBlock {
    constructor(pos, op, xmlDataBlock) {
        if (!isNaN(pos)) {
            this._pos = pos;
            this._op = op;
            this._xmlBlock = xmlDataBlock;
        } else {
            this.pos = pos.p;
            this.op = pos.op;
            this._xmlBlock = new XmlDataBlock(pos.data, op);
        }
    }

    initRemoteData(){
        return this._xmlBlock.init().then(()=>{
            return this;
        });
    }

    get xmlDataBlock() {
        return this._xmlBlock;
    }

    get pos() {
        return this._pos;
    }

    set pos(value) {
        this._pos = value;
    }

    get op() {
        return this._op;
    }

    set op(value) {
        this._op = value;
    }

    get length() {
        return this._xmlBlock.length;
    }

    set text(value) {
        this._xmlBlock.text = value;
    }

    get text() {
        return this._xmlBlock.text;
    }

    toString() {
        if (this.op === 'd') {
            return new Promise((resolve) => {
                resolve({p: this.pos, op: this.op});
            });
        }

        return this._xmlBlock.toString().then((encrypted) => {
            return {p: this.pos, op: this.op, data: encrypted};
        });
    }
}
