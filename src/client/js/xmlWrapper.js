import Delta from 'quill-delta';
import XmlDom from 'xmldom';
import Block from './block';
import xmlEnc from 'xml-enc/lib/type';

var xmlParser = new XmlDom.DOMParser();
var xmlSerializer = new XmlDom.XMLSerializer();


export default class XmlWrapper{
    constructor(doc){
        this.doc = doc;
        this.xmlDoc =  xmlParser.parseFromString(doc.data, 'application/xml');
        this._MAX_BLOCK_SIZE = 10;
    }

    quillTextChanged(delta){
        let documentElement = this._getDocumentElement();
        let myDelta = new Delta(delta);
        let offset = 0;
        let ops = [];
        myDelta.forEach(function (op) {
            if(typeof op['delete'] === 'number'){
                Array.prototype.push.apply(ops, this._deleteText(op.delete, documentElement, offset));
                offset -= op.delete;
            }else if(typeof op.retain === 'number'){
                offset += op.retain;
            }else {
                let opsResult = this._insertText(op.insert, documentElement, offset);
                Array.prototype.push.apply(ops, opsResult);
                offset += op.insert.length;
            }
        }.bind(this));
        this.doc.submitOp(ops, function (err) {
            if(err){
                throw new err;
            }
        });

    }

    get documentText(){
        let result = '';
        let documentElement = this._getDocumentElement();
        for(let i = 0; i < documentElement.childNodes.length; i++){
            result += documentElement.childNodes[i].getElementsByTagName('data').item(0).textContent;
        }
        return result;
    }

    /**
     * Deletes count characters from the document elements. All deletions bigger than text length will be ignored. The
     * Deletion is always starting at the offset and removing elements right from the offset (offset = 100, count = 10,
     * deletes the elements 111 - 120)
     * @param count determines how many characters will be deleted starting of the offset
     * @param documentElement the document node <document>
     * @param offset the offset of the postion based document. Determines the start of deletion of the first character
     * @returns {Array} returns an operation array that has to be submitted to the doc.submitOp function
     * @private
     */
    _deleteText(count, documentElement, offset){
        let block = this._getBlock(documentElement, offset);
        if(block === null){
            console.log('WARNING: The deletion request was bigger than the actual characters!');
            return [];
        }

        let cursorPos = offset - block.startPos;
        let tmpCount = count;
        let result = [];
        let deletedBlocks = 0;
        while(tmpCount > 0){
            if(block == null)
                break;
            if(cursorPos == 0 && tmpCount >= block.length){ // in this case we can delete the entire block
                result.push({p: block.blockPos - deletedBlocks, op: 'd'});
                tmpCount -= block.length;
                block.deleteBlock();
            }else if(cursorPos + tmpCount <= block.length){
                block.data = block.data.substr(0, cursorPos) + block.data.substr(cursorPos + tmpCount);
                tmpCount = 0;
                result.push({p: block.blockPos - deletedBlocks, op: 'r', data: xmlSerializer.serializeToString(block.block)});
            }else{ // delete part of the current block and then continue with the next one
                tmpCount -= (block.length - cursorPos);
                block.data = block.data.substr(0, cursorPos) + block.data.substr(block.length);
                result.push({p: block.blockPos - deletedBlocks, op: 'r', data: xmlSerializer.serializeToString(block.block)});
            }
            if(tmpCount > 0){
                block = this._getBlock(documentElement, offset);
                cursorPos = 0;
            }
        }
        return result;
    }

    /**
     * Inserts the input into the xml document
     * @param input text that shall be inserted into the xml document
     * @param documentElement the document node <document>
     * @param offset the offset of the position based document. Determines the insertion position of the first character
     * @returns {Array} returns an operation array that has to be submitted to the doc.submitOp function
     * @private
     */
    _insertText(input, documentElement, offset){
        let block = this._getBlock(documentElement, offset, true);
        let newBlock = false;
        //if it is the first insert we need to insert a new block into the xml doc
        if(block.length == 0){
            newBlock = true;
        }else{
            block.op = 'r';
        }

        if(block.startPos + block.length < offset){
            throw new Error('Insert is out of bounds!');
        }
        let result = [];
        let textPos = offset - block.startPos; //position within the block
        let newText = block.data.slice(0, textPos); //keep the first characters
        newText += input; //add new text
        newText += block.data.slice(textPos); //add the remaining characters
        if(newText.length > this._MAX_BLOCK_SIZE){
            //TODO check for block merge as well (at least for the last block)
            result = this._spitBlock(newText, block.blockPos);
            if(!newBlock) //if the insert effects an existing block then it has to be replaced
                result[0].op = 'r';
        }else{
            block.data = newText;
            result.push({p: block.blockPos, op: block.op, data: xmlSerializer.serializeToString(block.block)});
        }
        //change the local document
        for(let i = 0; i < result.length; i++){
            if(result[i].op == 'a')
                xmlEnc.addBlock(documentElement,result[i].p, result[i].data);
            else if(result[i].op == 'r')
                xmlEnc.replaceBlock(documentElement, result[i].p, result[i].data);
        }
        return result;
    }

    /**
     * Returns the corresponding block to the given position based offset
     * @param documentElement the document node <document>
     * @param offset the position within the position based document
     * @param creates a new block if the cursor is at the end of the last full block (required for insertions)
     * @returns {*} the corresponding block.
     * @private
     */
    _getBlock(documentElement, offset, createNewBlock){
        if(documentElement === undefined){
            throw new Error('<document>-Element is missing!');
        }

        let blockOffset = 0; // offset of the previous blocks
        let childNodes = documentElement.getElementsByTagName('length');
        let currentBlockLength = 0;
        let blockPos = 0;
        //Find corresponding block
        for(; blockPos < childNodes.length; blockPos++ ){
            currentBlockLength = parseInt(childNodes.item(blockPos).textContent)
            if(blockOffset <= offset && ((blockOffset + currentBlockLength) > offset)){
                return new Block(blockPos, blockOffset, 'r', childNodes.item(blockPos).parentNode);
                break;
            }
            blockOffset += currentBlockLength;
        }
        //it's not possible to delete or add anything which is not within the document
        if(blockOffset < offset)
            throw new Error('The offset: ' + offset + ' is greater than the text size ' + blockOffset + '!');
        //needed for insertion - a new block is required when the last block is full or it is the first insertion
        if(createNewBlock){
            if(currentBlockLength >= this._MAX_BLOCK_SIZE || childNodes.length == 0)
                return new Block(blockPos, blockOffset, 'a');
            else
                return new Block(blockPos - 1, blockOffset - currentBlockLength, 'r', childNodes.item(blockPos - 1).parentNode);
        }
    }

    /**
     * returns the <document> node which contains all the data blocks
     * @param xmlDoc the entire xml document
     * @returns {Element} returns the document node from the entire document
     * @private
     */
    _getDocumentElement(){
        return this.xmlDoc.documentElement.getElementsByTagName("document").item(0);
    }

    /**
     * splits the given text into n blocks
     * @param text text that should be split
     * @param firstBlockPos the position of the block within the xml document
     * @returns {Array} returns an array of split blocks
     * @private
     */
    _spitBlock(text, firstBlockPos){
        let count = Math.floor(text.length / this._MAX_BLOCK_SIZE);
        let result = [];
        if(text.length % this._MAX_BLOCK_SIZE)
            count++;
        for(let i = 0; i < count; i++){
            let block = new Block(firstBlockPos + i, 0, 'a');
            block.data = text.slice(i * this._MAX_BLOCK_SIZE, i * this._MAX_BLOCK_SIZE + this._MAX_BLOCK_SIZE);
            result.push({p: block.blockPos , op: block.op, data: xmlSerializer.serializeToString(block.block)})
        }
        return result;
    }

    get MAX_BLOCK_SIZE(){
        return this._MAX_BLOCK_SIZE;
    }
}