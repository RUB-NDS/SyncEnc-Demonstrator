import XmlDataBlock from './xmlDataBlock';

export default class RemoteDataBlock{
    constructor(pos, op , xmlDataBlock, remoteBlock){
        if(!isNaN(pos)){
            this._pos = pos;
            this._op = op;
            this.xmlBlock = xmlDataBlock;
        }else{
            this.pos = pos.p;
            this.op = pos.op;
            this.xmlBlock = new XmlDataBlock(pos.data);
        }
    }

    get pos(){
        return this._pos;
    }

    set pos(value){
        this._pos = value;
    }

    get op(){
        return this._op;
    }

    set op(value){
        this._op = value;
    }

    get length (){
        return this.xmlBlock.length;
    }

    set text(value){
        this.xmlBlock.text = value;
    }

    get text(){
        return this.xmlBlock.text;
    }

    toString(){
        if(this.op === 'd'){
            return {p: this.pos, op: this.op};
        }
        return {p: this.pos, op: this.op, data: this.xmlBlock.toString()};
    }
}