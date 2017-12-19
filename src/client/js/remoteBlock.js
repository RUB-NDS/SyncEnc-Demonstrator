import XmlDataBlock from 'quillWithEncryption/src/client/js/xmlDataBlock';

export default class RemoteBlock{
    constructor(remoteBlock){
        if(remoteBlock){
            this.pos = remoteBlock.p;
            this.op = remoteBlock.op;
            this.xmlBlock = new XmlDataBlock(remoteBlock.data);
        }else{
            this.pos = 0;
            this.op = 'a';
            this.xmlBlock = new XmlDataBlock();
        }

    }

    get pos(){
        return this._pos;
    }

    set pos(value){
        this.pos = value;
    }

    get op(){
        return this.op;
    }

    set op(value){
        this.op = value;
    }

    get length (){
        this.xmlBlock.length;
    }

    set text(value){
        this.xmlBlock.text = value;
    }

    get text(){
        return this.xmlBlock.text;
    }
}