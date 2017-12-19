import Delta from 'quill-delta';
import XmlDom from 'xmldom';
import XmlDataCollection from './xmlDataCollection';
import RemoteDataBlock from './remoteDataBlock';
import XmlDataBlock from './xmlDataBlock';

var xmlParser = new XmlDom.DOMParser();

export default class XmlWrapper{
    constructor(doc){
        this.doc = doc;
        this.xmlDoc =  xmlParser.parseFromString(doc.data, 'application/xml');
        this.xmlDataCollection = new XmlDataCollection(this.xmlDoc.documentElement.getElementsByTagName("document").item(0));
        this._MAX_BLOCK_SIZE = 10;
    }

    quillTextChanged(delta){
        let myDelta = new Delta(delta);
        let offset = 0;
        let ops = [];
        myDelta.forEach(function (op) {
            if(typeof op['delete'] === 'number'){
                Array.prototype.push.apply(ops, this._deleteText(op.delete, offset));
                offset -= op.delete;
            }else if(typeof op.retain === 'number'){
                offset += op.retain;
            }else {
                let opsResult = this._insertText(op.insert, offset);
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
        return this.xmlDataCollection.textContent;
    }

    /**
     * Deletes count characters from the document element. All deletions bigger than text length will be ignored. The
     * deletion is always starting at the offset and removing elements right from the offset (offset = 100, count = 10,
     * deletes the elements 111 - 120)
     * @param count determines how many characters will be deleted starting of the offset
     * @param offset the offset of the position based document. Determines the start of deletion of the first character
     * @returns {Array} returns an operation array that has to be submitted to the doc.submitOp function
     * @private
     */
    _deleteText(count, offset){
        let xmlDataBlockPos = this.xmlDataCollection.getXmlDataBlockPositionByTextOffset(offset);
        let xmlDataBlock = this.xmlDataCollection.getXmlDataBlockByBlockPosition(xmlDataBlockPos);
        if(xmlDataBlock === null){
            console.log('WARNING: The deletion request was bigger than the actual characters!');
            return [];
        }
        let xmlBlockOffset = this.xmlDataCollection.getXmlDataBlockOffsetByPos(xmlDataBlockPos); //start pos of the block
        let cursorPos = offset - xmlBlockOffset;
        let tmpCount = count;
        let result = [];
        while(tmpCount > 0){
            xmlDataBlock = this.xmlDataCollection.getXmlDataBlockByBlockPosition(xmlDataBlockPos);
            if(xmlDataBlock == null)
                break;
            if(cursorPos == 0 && tmpCount >= xmlDataBlock.length){ // in this case we can delete the entire block
                tmpCount -= xmlDataBlock.length;
                result.push(new RemoteDataBlock(xmlDataBlockPos, 'd', xmlDataBlock).toString());
                this.xmlDataCollection.deleteAtIndex(xmlDataBlockPos);
            }else if(cursorPos + tmpCount <= xmlDataBlock.length){
                xmlDataBlock.text =  xmlDataBlock.text.substr(0, cursorPos) + xmlDataBlock.text.substr(cursorPos + tmpCount);
                result.push(new RemoteDataBlock(xmlDataBlockPos, 'r', xmlDataBlock).toString());
                tmpCount = 0;
            }else{ // delete part of the current block and then continue with the next one
                tmpCount -= (xmlDataBlock.length - cursorPos);
                xmlDataBlock.text = xmlDataBlock.text.substr(0, cursorPos) + xmlDataBlock.text.substr(xmlDataBlock.length);
                result.push(new RemoteDataBlock(xmlDataBlockPos, 'r', xmlDataBlock).toString());
                xmlDataBlockPos++;
                cursorPos = 0;
            }
        }
        return result;
    }

    /**
     * Inserts the input into the xml document
     * @param input text that shall be inserted into the xml document
     * @param offset the offset of the position based document. Determines the insertion position of the first character
     * @returns {Array} returns an operation array that has to be submitted to the doc.submitOp function
     * @private
     */
    _insertText(input, offset){
        let xmlDataBlockPos = this.xmlDataCollection.getXmlDataBlockPositionByTextOffset(offset);
        let xmlDataBlock = this.xmlDataCollection.getXmlDataBlockByBlockPosition(xmlDataBlockPos);
        if(xmlDataBlock == null){
            this.xmlDataCollection.insertAtIndex(new XmlDataBlock(), xmlDataBlockPos);
            xmlDataBlock = this.xmlDataCollection.getXmlDataBlockByBlockPosition(xmlDataBlockPos);
        }
        let xmlDataBlockOffset = this.xmlDataCollection.getXmlDataBlockOffsetByPos(xmlDataBlockPos);

        if(xmlDataBlockOffset + xmlDataBlock.length < offset){
            throw new Error('Insert is out of bounds!');
        }
        let result = [];
        let textPos = offset - xmlDataBlockOffset; //position within the block
        let newText = xmlDataBlock.text.slice(0, textPos); //keep the first characters
        newText += input; //add new text
        newText += xmlDataBlock.text.slice(textPos); //add the remaining characters
        if(newText.length > this._MAX_BLOCK_SIZE){
            //TODO check for block merge as well (at least for the last block)
            result = this._spitBlock(newText, xmlDataBlockPos);
        }else{
            xmlDataBlock.text = newText;
            if(offset == 0){
                result.push(new RemoteDataBlock(0, 'a', xmlDataBlock).toString());
            }else{
                result.push(new RemoteDataBlock(xmlDataBlockPos, 'r', xmlDataBlock).toString());
            }
        }
        return result;
    }


    /**
     * splits the given text into n blocks
     * @param text text that should be split
     * @param firstBlockPos the position of the block within the xml document
     * @returns {Array} returns an array of split blocks
     * @private
     */
    _spitBlock(text, firstBlockPos){
        let firstBlock = false;
        if(firstBlockPos == 0)
            if(this.xmlDataCollection.getXmlDataBlockByBlockPosition(firstBlockPos).length == 0)
                firstBlock = true;

        let count = Math.floor(text.length / this._MAX_BLOCK_SIZE);
        let result = [];
        if(text.length % this._MAX_BLOCK_SIZE)
            count++;
        for(let i = 0; i < count; i++){
            let xmlDataBlock =  new XmlDataBlock();
            let remoteDataBlock = new RemoteDataBlock(firstBlockPos + i, 'a', xmlDataBlock);
            if(i != 0){
                this.xmlDataCollection.insertAtIndex(xmlDataBlock, firstBlockPos + i);
            }else{
                if(firstBlock){
                    this.xmlDataCollection.insertAtIndex(xmlDataBlock, firstBlockPos + i);
                }else{
                    remoteDataBlock.op = 'r';
                    this.xmlDataCollection.replaceAtIndex(xmlDataBlock, firstBlockPos + i);
                }
            }
            remoteDataBlock.text = text.slice(i * this._MAX_BLOCK_SIZE, i * this._MAX_BLOCK_SIZE + this._MAX_BLOCK_SIZE);
            result.push(remoteDataBlock.toString());
        }
        if(!firstBlock)
            result[0].op = 'r';
        return result;
    }

    get MAX_BLOCK_SIZE(){
        return this._MAX_BLOCK_SIZE;
    }
}