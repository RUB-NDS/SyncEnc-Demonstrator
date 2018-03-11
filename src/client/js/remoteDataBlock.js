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

    /**
     * Initializes the content of the remote block and returns a Promise
     */
    initRemoteData(){
        return this._xmlBlock.init().then(()=>{
            return this;
        });
    }

    /**
     * Returns the xmlDataBlock
     * @returns {*|XmlDataBlock}
     */
    get xmlDataBlock() {
        return this._xmlBlock;
    }

    /**
     * Returns the position of the data block within the xml document
     * @returns {*} position
     */
    get pos() {
        return this._pos;
    }

    /**
     * Sets the position of the data block
     * @param value position of the data block (within the xml document)
     */
    set pos(value) {
        this._pos = value;
    }

    /**
     * @returns {*} the operation of the data block (replace, insert, delete)
     */
    get op() {
        return this._op;
    }

    /**
     * Sets the operation of the data block (replace, insert, delete)
     * @param value
     */
    set op(value) {
        this._op = value;
    }

    /**
     * @returns {*} the text length of the data block
     */
    get length() {
        return this._xmlBlock.length;
    }

    /**
     * set the text of the data block
     * @param value text of the data block
     */
    set text(value) {
        this._xmlBlock.text = value;
    }

    /**
     * @returns {*} text of the data block
     */
    get text() {
        return this._xmlBlock.text;
    }

    /**
     * Returns a Promise which returns the string that has to be transmitted to the shareDB server
     * @returns {Promise<any>} promise that creates a string value for transmission 
     */
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
