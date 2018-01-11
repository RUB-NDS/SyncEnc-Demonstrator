import Delta from 'quill-delta';
import XmlDataCollection from './xmlDataCollection';
import RemoteDataBlock from './remoteDataBlock';
import XmlDataBlock from './xmlDataBlock';
import {EventEmitter} from 'eventemitter3';
import XmlHeaderSection from "./xmlHeaderSection";

var xmlParser = new window.DOMParser();
var xmlSerializer = new XMLSerializer();

class XmlWrapper {
    constructor(doc) {
        this.doc = doc;
        this.xmlDoc = null;
        this.xmlDataCollection = null;
        this.headerSection = null;
        this._MAX_BLOCK_SIZE = 10;
        this.emitter = new EventEmitter();
        this.documentKey = null;
    }

    quillTextChanged(delta) {
        let myDelta = new Delta(delta);
        let offset = 0;
        let opPromises = [];
        let tmpOp = null;
        myDelta.forEach(function (op) {
            if (typeof op['delete'] === 'number') {
                tmpOp = this._deleteText(op.delete, offset);
                this.xmlDataCollection.submitOp(tmpOp);
                opPromises.push(this._convertToShareDbOperation(tmpOp));
                offset -= op.delete;
            } else if (typeof op.retain === 'number') {
                if (op.attributes) {
                    tmpOp = this._attributeChange(op, offset);
                    this.xmlDataCollection.submitOp(tmpOp);
                    opPromises.push(this._convertToShareDbOperation(tmpOp));
                }
                offset += op.retain;
            } else {
                tmpOp = this._insertText(op, offset);
                this.xmlDataCollection.submitOp(tmpOp);
                opPromises.push(this._convertToShareDbOperation(tmpOp));
                offset += op.insert.length;
            }
        }.bind(this));
        return Promise.all(opPromises).then((opsPromises) => {
            let ops = [];
            for (let i = 0; i < opsPromises.length; i++) {
                Array.prototype.push.apply(ops, opsPromises[i]);
            }
            console.log(ops);
            this.doc.submitOp(ops, {source: "quill"});
        });

    }

    remoteUpdate(op) {
        let resultDeltaPromises = [];
        op.forEach(function (op) {
            let remoteDataBlock = new RemoteDataBlock(op, this.documentKey);
            resultDeltaPromises.push(remoteDataBlock.initRemoteData().then((remoteDataBlock) => {
                switch (remoteDataBlock.op) {
                    case 'a':
                        return this._insertTextInQuill(remoteDataBlock);
                        break;
                    case 'r':
                        return this._replaceTextInQuill(remoteDataBlock);
                        break;
                    case 'd':
                        return this._deleteTextInQuill(remoteDataBlock);
                        break;
                }
                console.log("pos: " + remoteDataBlock.pos + "offset :" + this.xmlDataCollection.getXmlDataBlockOffsetByPos(remoteDataBlock.pos));
            }));
        }.bind(this));

        Promise.all(resultDeltaPromises).then((delta) => {
            let resultDelta = new Delta();
            for (let i = 0; i < delta.length; i++) {
                resultDelta = resultDelta.compose(delta[i]);
            }
            return resultDelta;
        }).then((resultDelta) => {
            this.emitter.emit(XmlWrapper.events.REMOTE_UPDATE, resultDelta);
            console.log("DATA:" + this.doc.data);
            console.log("XMLD" + xmlSerializer.serializeToString(this.xmlDoc));
        });
    }

    on() {
        return this.emitter.on.apply(this.emitter, arguments);
    }

    /**
     * Must be executed after shareDb has transferred the entire document to the client.
     * The client must now convert the xml document to delta-quill.
     */
    shareDbDocumentLoaded() {
        this.xmlDoc = xmlParser.parseFromString(this.doc.data, 'application/xml');
        this.headerSection = new XmlHeaderSection(this.xmlDoc.documentElement.getElementsByTagName("header").item(0));
        if (this.headerSection.isEncrypted) {
            return this.headerSection.setDocumentKey().then(function (key) {
                this.documentKey = key;
                //this.encryptionTest();
                //this.decryptionTest();
                this.xmlDataCollection = new XmlDataCollection(
                    this.xmlDoc.documentElement.getElementsByTagName("document").item(0), this.documentKey);
                return Promise.all(this.xmlDataCollection.init()).then(() =>{
                    return this.xmlDataCollection.textContentWithFormattingDelta;
                });
            }.bind(this)).then(null, function (err) {
                console.error(err);
            });
        }
        else {
            this.xmlDataCollection = new XmlDataCollection(
                this.xmlDoc.documentElement.getElementsByTagName("document").item(0));
            return Promise.all(this.xmlDataCollection.init()).then(() =>{
                return this.xmlDataCollection.textContentWithFormattingDelta;
            });
        }
        console.error("Unreachable code !!");
    }

    documentKeyLoaded(key) {
        this.xmlDataCollection = new XmlDataCollection(
            this.xmlDoc.documentElement.getElementsByTagName("document").item(0), key);
        this.xmlDataCollection.init();
        this.emitter.emit(XmlWrapper.events.DOCUMENT_LOADED, this.xmlDataCollection.textContentWithFormattingDelta);
    }

    get documentText() {
        return this.xmlDataCollection.textContent;
    }

    get documentTextWithFormatting() {
        return this.xmlDataCollection.textContentWithFormattingDelta;
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
    _deleteText(count, offset) {
        let xmlDataBlockPos = this.xmlDataCollection.getXmlDataBlockPositionByTextOffset(offset);
        let xmlDataBlock = this.xmlDataCollection.getXmlDataBlockByBlockPosition(xmlDataBlockPos);
        if (xmlDataBlock === null) {
            console.log('WARNING: The deletion request was bigger than the actual characters!');
            return [];
        }
        let xmlBlockOffset = this.xmlDataCollection.getXmlDataBlockOffsetByPos(xmlDataBlockPos); //start pos of the
                                                                                                 // block
        let cursorPos = offset - xmlBlockOffset;
        let tmpCount = count;
        let result = [];
        let deletedBlocks = 0;
        while (tmpCount > 0) {
            xmlDataBlock = this.xmlDataCollection.getXmlDataBlockByBlockPosition(xmlDataBlockPos);
            if (xmlDataBlock == null)
                break;
            if (cursorPos == 0 && tmpCount >= xmlDataBlock.length) { // in this case we can delete the entire block
                tmpCount -= xmlDataBlock.length;
                result.push(new RemoteDataBlock(xmlDataBlockPos - deletedBlocks, 'd', xmlDataBlock));
                deletedBlocks++;
            } else if (cursorPos + tmpCount <= xmlDataBlock.length) {
                xmlDataBlock.text = xmlDataBlock.text.substr(0, cursorPos) + xmlDataBlock.text.substr(cursorPos + tmpCount);
                result.push(new RemoteDataBlock(xmlDataBlockPos - deletedBlocks, 'r', xmlDataBlock));
                tmpCount = 0;
            } else { // delete part of the current block and then continue with the next one
                tmpCount -= (xmlDataBlock.length - cursorPos);
                xmlDataBlock.text = xmlDataBlock.text.substr(0, cursorPos) + xmlDataBlock.text.substr(xmlDataBlock.length);
                result.push(new RemoteDataBlock(xmlDataBlockPos - deletedBlocks, 'r', xmlDataBlock));
                cursorPos = 0;
            }
            xmlDataBlockPos++;
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
    _insertText(input, offset) {
        let xmlDataBlockPos = this.xmlDataCollection.getXmlDataBlockPositionByTextOffset(offset);
        let xmlDataBlock = this.xmlDataCollection.getXmlDataBlockByBlockPosition(xmlDataBlockPos);
        let isNewBlock = false;
        if (xmlDataBlock == null) {
            isNewBlock = true;
            xmlDataBlock = new XmlDataBlock(null, this.documentKey);
            xmlDataBlock.init();
        }
        let xmlDataBlockOffset = this.xmlDataCollection.getXmlDataBlockOffsetByPos(xmlDataBlockPos);

        if (xmlDataBlockOffset + xmlDataBlock.length < offset) {
            throw new Error('Insert is out of bounds!');
        }
        if (input.attributes) {
            if (xmlDataBlock.compareAttributes(input.attributes)) {
                return this._insertTextWithSameAttributes(input, offset, xmlDataBlockOffset, xmlDataBlock,
                    xmlDataBlockPos, isNewBlock);
            } else {
                return this._insertTextWithDifferentAttributes(input, offset, xmlDataBlockOffset, xmlDataBlock,
                    xmlDataBlockPos, isNewBlock)
            }
        } else {
            if (xmlDataBlock.getAttributes() === null) {
                return this._insertTextWithSameAttributes(input, offset, xmlDataBlockOffset, xmlDataBlock,
                    xmlDataBlockPos, isNewBlock);
            } else {
                return this._insertTextWithDifferentAttributes(input, offset, xmlDataBlockOffset, xmlDataBlock,
                    xmlDataBlockPos, isNewBlock)
            }
        }
    }

    _insertTextWithSameAttributes(input, offset, xmlDataBlockOffset, xmlDataBlock, xmlDataBlockPos, isNewBlock) {
        let textPos = offset - xmlDataBlockOffset; //position within the block
        let newText = xmlDataBlock.text.slice(0, textPos); //keep the first characters
        newText += input.insert; //add new text
        newText += xmlDataBlock.text.slice(textPos); //add the remaining characters
        let result = this._splitBlock(newText, xmlDataBlockPos);
        let attributes = xmlDataBlock.getAttributes();
        if (attributes) {
            for (let i = 0; i < result.length; i++) {
                result[i].xmlDataBlock.setAttributes(attributes);
            }
        }
        if (!isNewBlock) {
            result[0].op = 'r';
        }
        return result;
    }

    _insertTextWithDifferentAttributes(input, offset, xmlDataBlockOffset, xmlDataBlock, xmlDataBlockPos, isNewBlock) {
        let textPos = offset - xmlDataBlockOffset; //position within the block
        let result = [];
        //keep the first characters
        let newText = xmlDataBlock.text.slice(0, textPos);
        if (newText.length != 0) {
            result.push(this._createRemoteDataBlock(newText, xmlDataBlockPos, xmlDataBlock.getAttributes()));
        }
        //add the new characters with formatting
        let tmpResult = this._splitBlock(input.insert, xmlDataBlockPos + result.length);
        if (input.attributes) {
            for (let i = 0; i < tmpResult.length; i++) {
                tmpResult[i].xmlDataBlock.setAttributes(input.attributes);
            }
        }
        Array.prototype.push.apply(result, tmpResult);

        //keep the old characters
        newText = xmlDataBlock.text.slice(textPos, xmlDataBlock.length);
        if (newText.length != 0) {
            result.push(this._createRemoteDataBlock(newText, xmlDataBlockPos + result.length, xmlDataBlock.getAttributes()))
        }

        if (!isNewBlock) {
            result[0].op = 'r';
        }
        return result;
    }

    _attributeChange(delta, offset) {
        let xmlDataBlockPos = this.xmlDataCollection.getXmlDataBlockPositionByTextOffset(offset);
        let xmlDataBlockOffset = this.xmlDataCollection.getXmlDataBlockOffsetByPos(xmlDataBlockPos);
        let count = delta.retain;
        let xmlDataBlockList = this.xmlDataCollection.getXmlDataBlockListByOffsetAndLength(offset, count);
        let cursorPos = offset - xmlDataBlockOffset;
        let resultRemoteDataBlock = [];
        let text = xmlDataBlockList[0].text.substr(0, cursorPos);
        let tmpRemoteDataBlock = null;
        let countBlocks = xmlDataBlockPos;
        //if there is unchanged data within the first block (0 to cursorPos).
        if (text.length != 0) {
            //clone the block and put it in a new Block, change the text
            tmpRemoteDataBlock = new RemoteDataBlock(xmlDataBlockPos, 'r', xmlDataBlockList[0].clone());
            tmpRemoteDataBlock.text = text;
            resultRemoteDataBlock.push(tmpRemoteDataBlock);
            countBlocks++;
        }

        for (let index in xmlDataBlockList) {
            let currentBlock = xmlDataBlockList[index];
            let tmpRemoteDataBlock = null;
            let text = "";
            if (cursorPos + count > currentBlock.length) {
                text = currentBlock.text.substr(cursorPos, xmlDataBlockList[index].length);
                count -= (currentBlock.length - cursorPos);
                tmpRemoteDataBlock = this._createRemoteDataBlock(text, countBlocks, currentBlock.getAttributes());
                tmpRemoteDataBlock.xmlDataBlock.setAttributes(delta.attributes);
                resultRemoteDataBlock.push(tmpRemoteDataBlock);
                countBlocks++;
                cursorPos = 0;
            } else {
                text = currentBlock.text.substr(cursorPos, count);
                tmpRemoteDataBlock = this._createRemoteDataBlock(text, countBlocks, currentBlock.getAttributes());
                tmpRemoteDataBlock.xmlDataBlock.setAttributes(delta.attributes);
                resultRemoteDataBlock.push(tmpRemoteDataBlock);
                countBlocks++;
                cursorPos += count;
                count = 0;
            }
        }

        //if there is unchanged data within the last block (offset to block end)
        let lastDataBlock = xmlDataBlockList[xmlDataBlockList.length - 1];
        if (lastDataBlock.length - cursorPos > 0) {
            text = lastDataBlock.text.substr(cursorPos, lastDataBlock.length);
            tmpRemoteDataBlock = new RemoteDataBlock(countBlocks, 'a', lastDataBlock.clone());
            tmpRemoteDataBlock.text = text;
            resultRemoteDataBlock.push(tmpRemoteDataBlock);
        }

        //set remote operations, first replacements
        let countReplacements = (resultRemoteDataBlock.length < xmlDataBlockList.length ?
            resultRemoteDataBlock.length : xmlDataBlockList.length)
        for (let j = 0; j < countReplacements; j++)
            resultRemoteDataBlock[j].op = 'r';

        //if there are more blocks than before, we have to add new blocks to the xml
        if (resultRemoteDataBlock.length > xmlDataBlockList.length)
            for (let j = xmlDataBlockList.length; j < resultRemoteDataBlock.length; j++)
                resultRemoteDataBlock[j].op = 'a';

        //if there less blocks than before, we have to delete the other blocks
        else if (resultRemoteDataBlock.length < xmlDataBlockList.length)
            for (let j = resultRemoteDataBlock.length; j < xmlDataBlockList.length; j++) {
                resultRemoteDataBlock.push(new RemoteDataBlock(countBlocks, 'd'));
            }

        return resultRemoteDataBlock;
    }

    /**
     * splits the given text into n blocks
     * @param text text that should be split
     * @param firstBlockPos the position of the block within the xml document
     * @returns {Array} returns an array of split blocks
     * @private
     */
    _splitBlock(text, firstBlockPos) {
        let count = Math.floor(text.length / this._MAX_BLOCK_SIZE);
        let result = [];
        if (text.length % this._MAX_BLOCK_SIZE)
            count++;
        for (let i = 0; i < count; i++) {
            let xmlDataBlock = new XmlDataBlock(null, this.documentKey);
            xmlDataBlock.init();
            let remoteDataBlock = new RemoteDataBlock(firstBlockPos + i, 'a', xmlDataBlock);
            remoteDataBlock.text = text.slice(i * this._MAX_BLOCK_SIZE, i * this._MAX_BLOCK_SIZE + this._MAX_BLOCK_SIZE);

            result.push(remoteDataBlock);
        }
        return result;
    }

    _convertToShareDbOperation(ops) {

        let resultPromise = [];
        for (let i = 0; i < ops.length; i++) {
            resultPromise.push(ops[i].toString());
        }
        return Promise.all(resultPromise).then(data => {
            let result = [];
            for (let i = 0; i < data.length; i++) {
                result.push(data[i]);
            }
            return result;
        });
    }

    _insertTextInQuill(remoteDataBlock) {
        let dataBlockOffset = this.xmlDataCollection.getXmlDataBlockOffsetByPos(remoteDataBlock.pos);
        let attributes = remoteDataBlock.xmlDataBlock.getAttributes();
        let delta = null;
        if (attributes)
            delta = new Delta().retain(dataBlockOffset).insert(remoteDataBlock.text, attributes);
        else
            delta = new Delta().retain(dataBlockOffset).insert(remoteDataBlock.text);
        this.xmlDataCollection.insertAtIndex(remoteDataBlock._xmlBlock, remoteDataBlock.pos);
        return delta;
    }

    _deleteTextInQuill(remoteDataBlock) {
        let dataBlockOffset = this.xmlDataCollection.getXmlDataBlockOffsetByPos(remoteDataBlock.pos);
        let localDataBlock = this.xmlDataCollection.getXmlDataBlockByBlockPosition(remoteDataBlock.pos);
        let delta = new Delta().retain(dataBlockOffset).delete(localDataBlock.length);
        this.xmlDataCollection.deleteAtIndex(remoteDataBlock.pos);
        return delta;
    }

    _replaceTextInQuill(remoteDataBlock) {
        let dataBlockOffset = this.xmlDataCollection.getXmlDataBlockOffsetByPos(remoteDataBlock.pos);
        let localDataBlock = this.xmlDataCollection.getXmlDataBlockByBlockPosition(remoteDataBlock.pos);
        let attributes = remoteDataBlock.xmlDataBlock.getAttributes();
        let delta = null;
        if (attributes)
            delta = new Delta().retain(dataBlockOffset)
                .insert(remoteDataBlock.text, attributes)
                .delete(localDataBlock.length);
        else
            delta = new Delta().retain(dataBlockOffset)
                .insert(remoteDataBlock.text)
                .delete(localDataBlock.length);
        this.xmlDataCollection.replaceAtIndex(remoteDataBlock._xmlBlock, remoteDataBlock.pos);
        return delta;
    }

    _createRemoteDataBlock(text, pos, attributes) {
        let xmlDataBlock = new XmlDataBlock(null, this.documentKey);
        xmlDataBlock.init();
        xmlDataBlock.setAttributes(attributes);
        let xmlRemoteDataBlock = new RemoteDataBlock(pos, 'a', xmlDataBlock);
        xmlRemoteDataBlock.text = text;
        return xmlRemoteDataBlock;
    }

    get MAX_BLOCK_SIZE() {
        return this._MAX_BLOCK_SIZE;
    }
}

XmlWrapper.events = {
    REMOTE_UPDATE: 'remote-update',
    TEXT_RELOAD: 'text-reload',
    DOCUMENT_LOADED: 'document-loaded'
};

export default XmlWrapper;