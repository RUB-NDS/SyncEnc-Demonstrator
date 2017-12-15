import XmlDom from "xmldom";

var xmlDoc = new XmlDom.DOMImplementation().createDocument("","",null);

export default class Block{
    /**
     * Creates a new data block.
     * @param blockPos the block position in the xml document
     * @param startBlockPos the sum of length of all previous blocks. This is required to determine the right position
     * within the block, e.g. for adding a character at pos 4 [data: hell] -> [data: hello]
     * @param xmlBlockElement the block element from the current document. If left blank a new XML element will be
     * created
     */
    constructor(blockPos, startBlockPos, op, xmlBlockElement){
        if(!xmlBlockElement){
            this.element = this._createEmptyBlockElement();
        }
        else{
            this.element = xmlBlockElement;
        }
        this._blockPos = blockPos;
        this._startPos = startBlockPos;
        this._op = op;
    }

    /**
     * Creates a new block element.
     * @returns {HTMLElement} the created block element.
     * @private
     */
    _createEmptyBlockElement(){
        var blockElement = xmlDoc.createElement('block');
        var dataElement = xmlDoc.createElement('data');
        var lengthElement = xmlDoc.createElement('length');
        lengthElement.textContent = 0;
        blockElement.appendChild(lengthElement);
        blockElement.appendChild(dataElement);
        return blockElement;
    }

    deleteBlock(){
        this.element.parentNode.removeChild(this.element);
    }

    get length(){
        return this.element.getElementsByTagName('length').item(0).textContent;
    }

    set length(length){
        this.element.getElementsByTagName('length').item(0).textContent = length;
    }

    get data(){
        return this.element.getElementsByTagName('data').item(0).textContent;
    }

    set data(data){
        this.element.getElementsByTagName('data').item(0).textContent = data;
        this.length = data.length;
    }

    get block(){
        return this.element;
    }

    get startPos(){
        return this._startPos;
    }

    get blockPos(){
        return this._blockPos;
    }

    get op(){
        return this._op;
    }

    set op(value){
        this._op = value;
    }

}