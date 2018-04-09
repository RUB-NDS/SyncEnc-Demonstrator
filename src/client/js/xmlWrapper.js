import Delta from 'quill-delta';
import XmlDataCollection from './xmlDataCollection';
import RemoteDataBlock from './remoteDataBlock';
import XmlDataBlock from './xmlDataBlock';
import {EventEmitter} from 'eventemitter3';
import XmlHeaderSection from "./xmlHeaderSection";
import xmlEnc from "xml-enc/lib/type";
import KeyHandler from "./keyHandler";
import HelperClass from "./HelperClass";

var xmlParser = new window.DOMParser();
var xmlSerializer = new XMLSerializer();

class XmlWrapper {
    constructor(doc, useStaticKeys) {
        this.doc = doc;
        this.xmlDoc = null;
        this.xmlDataCollection = null;
        this.headerSection = null;
        this._MAX_BLOCK_SIZE = 16;
        this.emitter = new EventEmitter();
        this.documentKey = null;
        this.keyHandler = new KeyHandler(useStaticKeys);
        this.isWaitingForPrivateKey = false;
        this.storedOps = [];
        this.otExtenderModule = window.quill.getModule("OtExtender");
    }

    /**
     * Must be called if the quill text has been changed. The function expects a quill-delta delta of the change.
     * @param delta of the change
     * @returns {Promise<[any , any , any , any , any , any , any , any , any , any]>} Promise which will be resolved
     * after all operations have been executed.
     */
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
            //try to submit the Operations, in case anything goes wrong request the current document state from the
            // server
            try {
                this.doc.submitOp(ops, {source: "quill"});
            } catch (e) {
                //disable quill before requesting the current state
                window.quill.disable();
                this.doc.fetch(function (err) {
                    let otExtender = window.quill.getModule('OtExtender');
                    if (err) {
                        otExtender.setStatusBarMessage(err, "red");
                        throw err;
                    } else {
                        otExtender.shareDbDocumentLoaded(this.doc);
                    }
                });
            }
        });
    }

    /**
     * Handles remote updates from the server
     * @param op RemoteDataBlock that contains all changes of the server
     */
    remoteUpdate(op) {
        //Header changes are always coming first
        if (op[0].op === xmlEnc.operations.ADD_OR_REPLACE_HEADER_ELEMENT) {
            let headerChanges = [];
            let documentChanges = [];
            //Sort out the operations
            op.forEach(function (op) {
                if (op.op === xmlEnc.operations.ADD_OR_REPLACE_HEADER_ELEMENT) {
                    headerChanges.push(op);
                } else {
                    documentChanges.push(op);
                }
            });

            //execute first header operations and then document changes (maybe the document key has been changed)
            this.headerSection.setHeaderElement(headerChanges);
            if (this.headerSection.isEncrypted) {
                window.quill.disable();
                this.otExtenderModule.disableButtons();
                this.isWaitingForPrivateKey = true;
                this.keyHandler.loadPrivateKey(false).then((priKey) => {
                    this.headerSection.user = this.keyHandler.user;
                    this.headerSection.loadDocumentKey(priKey).then((key) => {
                        this.documentKey = key;
                        this._executeDocumentOperations(documentChanges);
                        this.executeStoredDocumentOperations();
                        window.quill.enable();
                        this.otExtenderModule.enableButtons();
                    });
                });
            }
        } else {
            //In case of waiting for private key, store all operations and execute them afterwards
            if (this.isWaitingForPrivateKey) {
                this.storedOps.push(op);
            } else {
                this._executeDocumentOperations(op);
            }

        }
    }

    /**
     * Executes the stored operations to "rebuild" the document
     */
    executeStoredDocumentOperations() {
        for (let i = 0; i < this.storedOps.length; i++) {
            this._executeDocumentOperations(this.storedOps[i]);
        }
        this.storedOps = [];
        this.isWaitingForPrivateKey = false;
    }

    /**
     * Function to provide event listener
     * @returns {EventEmitter} with the corresponding event
     */
    on() {
        if (arguments[0] === XmlWrapper.events.DOCUMENT_ENCRYPTION_CHANGED) {
            this.headerSection.on(XmlHeaderSection.events.ENCRYPTION_CHANGED, arguments[1]);
        } else {
            return this.emitter.on.apply(this.emitter, arguments);
        }
    }

    /**
     * Function must be executed after shareDB has transferred the entire document to the client. This function loads
     * then the header and checks if the document is encrypted. In case of encryption the decryption process will be
     * executed. After the decryption is done the method will return a object containing the entire document as a
     * quill-delta format and a boolean value isEncrypted which shows if the document is encrypted or not.
     * ({delte: xxx, isEncrypted: true/false})
     * @returns {Promise<[any , any , any , any , any , any , any , any , any , any]>} Promise that returns an object
     * containing the delta with all formatting and a boolean that shows if the document is encrypted or not. {delta:
     *     aa, isEncrypted: false}
     */
    shareDbDocumentLoaded() {
        this.xmlDoc = xmlParser.parseFromString(this.doc.data, 'application/xml');
        this.headerSection = new XmlHeaderSection(this.xmlDoc.documentElement.getElementsByTagName("header").item(0));
        if (this.headerSection.isEncrypted) {
            this.isWaitingForPrivateKey = true;
            return this.keyHandler.loadPrivateKey().then((privateKey) => {
                this.headerSection.user = this.keyHandler.user;
                return this.headerSection.loadDocumentKey(privateKey).then(function (key) {
                    this.documentKey = key;
                    this.xmlDataCollection = new XmlDataCollection(
                        this.xmlDoc.documentElement.getElementsByTagName("document").item(0), this.documentKey);
                    return Promise.all(this.xmlDataCollection.init()).then(() => {
                        return {
                            delta: this.xmlDataCollection.textContentWithFormattingDelta,
                            isEncrypted: this.headerSection.isEncrypted
                        };
                    });
                }.bind(this)).then(null, function (err) {
                    //Do if user is not part of the stuff
                    console.error(err);
                });
            });
        } else {
            this.xmlDataCollection = new XmlDataCollection(
                this.xmlDoc.documentElement.getElementsByTagName("document").item(0));
            return Promise.all(this.xmlDataCollection.init()).then(() => {
                return {
                    delta: this.xmlDataCollection.textContentWithFormattingDelta,
                    isEncrypted: this.headerSection.isEncrypted
                };
            });
        }
    }

    /**
     * Encrypts the document. First a new document key will be created and the document key will be encrypted
     * by the corresponding user's public key. Also the header section will be updated. Afterwards, all data, including
     * the encrypted document and the header section, will be send to the server.
     * @returns {PromiseLike<CryptoKey>}
     */
    encryptDocument() {
        return this.headerSection.createDocumentKey().then((docKey) => {
            this.documentKey = docKey;
            return this.keyHandler.loadPublicKey().then((pubKey) => {
                this.headerSection.user = this.keyHandler.user;
                //Add the user to the header
                let ops = [];
                let myUser = [];
                myUser.push({
                    user: this.keyHandler.user,
                    publicKey: pubKey
                });

                return this.headerSection.addUsers(myUser, this.documentKey).then((remoteChanges) => {
                    Array.prototype.push.apply(ops, remoteChanges);//add the changes to the server op array
                    //all block must be replaced for encryption
                    let remoteDataBlocks = this._replaceAllBlocks();
                    let opPromises = [];
                    opPromises.push(this._convertToShareDbOperation(remoteDataBlocks));
                    return Promise.all(opPromises).then((opArray) => {
                        for (let i = 0; i < opArray.length; i++) {
                            Array.prototype.push.apply(ops, opArray[i]);
                        }
                        this.doc.submitOp(ops, {source: "quill"});
                        console.log(this.doc.data);
                    });
                });
            });
        });
    }

    /**
     * Adds a new user to the document and generates a new document key. An existing user will be ignored.
     * @param user name of the user that shall be added to the document.
     */
    addUserToDocument(user) {
        //Get all current users of the document to generate a new document key (user cannot decrypt older versions)
        let userList = this.headerSection.getUserList();
        if (HelperClass.searchStringInArray(userList, user) === true) {
            return;
        }
        userList.push(user);
        return this._handleAddOrRemoveUserToDocument(userList);

    }

    /**
     * Removes a user from the document and generates a new document key. A Non existing user will be ignored.
     * @param user name of the user that shall be removed from the document.
     */
    removeUserFromDocument(user) {
        let userList = this.headerSection.getUserList();
        if (HelperClass.searchStringInArray(userList, user) === true) {
            if (userList.indexOf(user) !== -1) {
                userList.splice(userList.indexOf(user), 1);
                this.headerSection.removeUser(user);
            }
            return this._handleAddOrRemoveUserToDocument(userList);
        }
    }

    /**
     * Function generates a new document key and adds or removes the corresponding user from the document. The function
     * will collect all existing users of the current document and will encrypt the new document key with every user's
     * public key.
     * @param userList of users that have access to the document. Existing users will be updated and new users will be
     * created.
     * @private
     */
    _handleAddOrRemoveUserToDocument(userList) {
        this.keyHandler.getPublicKeysByUsers(userList).then((resultArray) => {
            this.headerSection.createDocumentKey().then((docKey) => {
                this.documentKey = docKey;
                this.headerSection.addUsers(resultArray, docKey).then((remoteChanges) => {
                    //Add the user to the header
                    let ops = [];
                    Array.prototype.push.apply(ops, remoteChanges);//add the changes to the server op array
                    //all block must be replaced for encryption
                    let remoteDataBlocks = this._replaceAllBlocks();
                    let opPromises = [];
                    opPromises.push(this._convertToShareDbOperation(remoteDataBlocks));
                    return Promise.all(opPromises).then((opArray) => {
                        for (let i = 0; i < opArray.length; i++) {
                            Array.prototype.push.apply(ops, opArray[i]);
                        }
                        this.doc.submitOp(ops, {source: "quill"});
                        console.log(this.doc.data);
                        console.log(this.headerSection.getUserList());
                    });
                });
            });
        });
    }

    /**
     * Executes the remote document operations. The function decrypts the content of the remote block and
     * inserts the changes into the quill document
     * @param op document operations that shall be executed
     * @private
     */
    _executeDocumentOperations(op) {
        let resultDeltaPromises = [];
        //init the block - required for decryption
        op.forEach(function (op) {
            let remoteDataBlock = new RemoteDataBlock(op, this.documentKey);
            resultDeltaPromises.push(remoteDataBlock.initRemoteData());
        }.bind(this));

        //after init of all block create a delta for quill
        Promise.all(resultDeltaPromises).then((remoteDataBlocks) => {
            let resultDelta = new Delta();
            for (let i = 0; i < remoteDataBlocks.length; i++) {
                switch (remoteDataBlocks[i].op) {
                    case xmlEnc.operations.ADD_DOCUMENT_BLOCK:
                        resultDelta = resultDelta.compose(this._insertTextInQuill(remoteDataBlocks[i]));
                        break;
                    case xmlEnc.operations.REPLACE_DOCUMENT_BLOCK:
                        resultDelta = resultDelta.compose(this._replaceTextInQuill(remoteDataBlocks[i]));
                        break;
                    case xmlEnc.operations.REMOVE_DOCUMENT_BLOCK:
                        resultDelta = resultDelta.compose(this._deleteTextInQuill(remoteDataBlocks[i]));
                        break;
                }
            }
            return resultDelta;
        }).then((resultDelta) => {
            //after
            this.emitter.emit(XmlWrapper.events.REMOTE_UPDATE, resultDelta);
        });
    }

    /**
     * Replaces all blocks of the document. That is required if the document encryption changes. All blocks musst be
     * replaced and this function returns a list of all blocks.
     * @returns {Array} all blocks of the document
     * @private
     */
    _replaceAllBlocks() {
        let xmlRemoteDataBlocks = [];
        for (let i = 0; i < this.xmlDataCollection.dataBlockList.length; i++) {
            this.xmlDataCollection.dataBlockList[i].setDocumentKey(this.documentKey);
            xmlRemoteDataBlocks.push(new RemoteDataBlock(i, 'r', this.xmlDataCollection.dataBlockList[i]));
        }
        return xmlRemoteDataBlocks;
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
     * Inserts the input from quill into the xml document
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

    /**
     * Generates blocks that will be inserted into the xml document. The inserted text must have the same attributes
     * (formatting).
     * @param input text input that shall be inserted into the xml document
     * @param offset starting position of the insertion (position based)
     * @param xmlDataBlockOffset the block offset all the blocks until the start of xmlDataBlock
     * @param xmlDataBlock the block which contains the offset position
     * @param xmlDataBlockPos position of the block within the xml document
     * @param isNewBlock if the block has been created (were non existing before)
     * @returns {Array} returns an array with operations for doc.submitOp
     * @private
     */
    _insertTextWithSameAttributes(input, offset, xmlDataBlockOffset, xmlDataBlock, xmlDataBlockPos, isNewBlock) {
        let textPos = offset - xmlDataBlockOffset; //position within the block
        let newText = xmlDataBlock.text.slice(0, textPos); //keep the first characters
        newText += input.insert; //add new text
        newText += xmlDataBlock.text.slice(textPos); //add the remaining characters
        let result = this._splitBlock(newText, xmlDataBlockPos, textPos, input.attributes, isNewBlock);
        let attributes = xmlDataBlock.getAttributes();
        if (attributes) {
            for (let i = 0; i < result.length; i++) {
                result[i].xmlDataBlock.setAttributes(attributes);
            }
        }
        return result;
    }

    /**
     * Generates blocks that will be inserted into the xml document. The inserting text has not the same formatting
     * (attributes)
     * @param input text input that shall be inserted into the xml document
     * @param offset starting position of the insertion (position based)
     * @param xmlDataBlockOffset the block offset all the blocks until the start of xmlDataBlock
     * @param xmlDataBlock the block which contains the offset position
     * @param xmlDataBlockPos position of the block within the xml document
     * @param isNewBlock if the block has been created (were non existing before)
     * @returns {Array} returns an array with operations for doc.submitOp
     * @private
     */
    _insertTextWithDifferentAttributes(input, offset, xmlDataBlockOffset, xmlDataBlock, xmlDataBlockPos, isNewBlock) {
        let textPos = offset - xmlDataBlockOffset; //position within the block
        let result = [];
        //keep the first characters
        let newText = xmlDataBlock.text.slice(0, textPos);
        if (newText.length != 0) {
            result.push(this._createRemoteDataBlock(newText, xmlDataBlockPos, xmlDataBlock.getAttributes()));
        }
        //add the new characters with formatting
        let tmpResult = this._splitBlock(input.insert, xmlDataBlockPos + result.length, textPos, input.attributes, isNewBlock);
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
        return result;
    }

    /**
     * Changes the attributes of the given delta
     * @param delta quill delta change for changing the attribute field
     * @param offset the offset of the change
     * @returns {Array} result of the changes for the doc.submitOps function
     * @private
     */
    _attributeChange(delta, offset) {
        let xmlDataBlockPos = this.xmlDataCollection.getXmlDataBlockPositionByTextOffset(offset);
        let xmlDataBlockOffset = this.xmlDataCollection.getXmlDataBlockOffsetByPos(xmlDataBlockPos);
        let count = delta.retain; // how may characters are effected
        let xmlDataBlockList = this.xmlDataCollection.getXmlDataBlockListByOffsetAndLength(offset, count);
        let cursorPos = offset - xmlDataBlockOffset;
        let resultRemoteDataBlock = [];
        let text = xmlDataBlockList[0].text.substr(0, cursorPos);
        let tmpRemoteDataBlock = null;
        let countBlocks = xmlDataBlockPos;
        //if there is unchanged data within the first block (0 to cursorPos).
        if (text.length !== 0 && xmlDataBlockList[0].text.length !== cursorPos) {
            //clone the block and put it in a new Block, change the text
            tmpRemoteDataBlock = new RemoteDataBlock(xmlDataBlockPos, 'r', xmlDataBlockList[0].clone());
            tmpRemoteDataBlock.text = text;
            resultRemoteDataBlock.push(tmpRemoteDataBlock);
            countBlocks++;
        }

        //In case that the cursorPos points at the end of the block (nothing can be changed)
        if (xmlDataBlockList[0].text.length === cursorPos) {
            countBlocks++;
            xmlDataBlockList.splice(0, 1);
            cursorPos = 0;
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
            resultRemoteDataBlock.length : xmlDataBlockList.length);
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
     * @param textPos position of the cursor within the text
     * @param attributes (formatting) of the current text
     * @param isNewBlock if this block is a new one than it must be added to the document. If the
     * block already existed than it must be replaced
     * @returns {Array} returns an array of remoteDataBlocks for the doc.submitOps function
     * @private
     */
    _splitBlock(text, firstBlockPos, textPos, attributes, isNewBlock) {
        let count = Math.floor(text.length / this._MAX_BLOCK_SIZE);
        let result = [];
        if (text.length % this._MAX_BLOCK_SIZE)
            count++;
        //in case of an bigger paste, do not do merging
        if (count > 2 || text.length > this._MAX_BLOCK_SIZE + this.MAX_BLOCK_SIZE / 2) {
            for (let i = 0; i < count; i++) {
                let xmlDataBlock = new XmlDataBlock(null, this.documentKey);
                xmlDataBlock.init();
                let remoteDataBlock = new RemoteDataBlock(firstBlockPos + i, 'a', xmlDataBlock);
                remoteDataBlock.text = text.slice(i * this._MAX_BLOCK_SIZE, i * this._MAX_BLOCK_SIZE + this._MAX_BLOCK_SIZE);

                result.push(remoteDataBlock);
            }
        } else {
            if (count === 1) { //no merging needed
                let xmlDataBlock = new XmlDataBlock(null, this.documentKey);
                xmlDataBlock.init();
                let remoteDataBlock = new RemoteDataBlock(firstBlockPos, 'a', xmlDataBlock);
                remoteDataBlock.text = text;
                result.push(remoteDataBlock);
            } else {
                this._handleSpiltBlockWithMerge(text, firstBlockPos, textPos, attributes, result, isNewBlock);
            }
        }
        if (!isNewBlock) {
            result[0].op = 'r';
        }
        return result;
    }

    /**
     * function tries to merge data to the previous block or splits it into two blocks
     * @param text text that should be merged
     * @param firstBlockPos the position of the block within the xml document
     * @param textPos position of the cursor within the text
     * @param attributes (formatting) of the current text
     * @param result result array of the remote change operations
     * @param isNewBlock if this block is a new one than it must be added to the document. If the
     * block already existed than it must be replaced
     * @private
     */
    _handleSpiltBlockWithMerge(text, firstBlockPos, textPos, attributes, result, isNewBlock) {
        let previousBlock = this._getBlockIfEqualAttributes(
            this.xmlDataCollection.getXmlDataBlockByBlockPosition(firstBlockPos - 1), attributes);
        let currentTextPos = 0;
        if (previousBlock != null && previousBlock.text.length < this._MAX_BLOCK_SIZE) {
            let block = previousBlock.clone();
            currentTextPos = this._MAX_BLOCK_SIZE - block.text.length;
            block.text += text.slice(0, currentTextPos);
            result.push(new RemoteDataBlock(firstBlockPos - 1, 'r', block));
        }

        let xmlDataBlock1 = new XmlDataBlock(null, this.documentKey);
        xmlDataBlock1.init();
        let remoteDataBlock1 = new RemoteDataBlock(firstBlockPos, 'r', xmlDataBlock1);
        if (isNewBlock)
            remoteDataBlock1.op = 'a';
        remoteDataBlock1.text = text.slice(currentTextPos, text.length);
        if (text.length - currentTextPos > this._MAX_BLOCK_SIZE) {
            let midPos = Math.floor((text.length - currentTextPos) / 2);
            let xmlDataBlock2 = new XmlDataBlock(null, this.documentKey);
            xmlDataBlock2.init();

            let remoteDataBlock2 = new RemoteDataBlock(firstBlockPos + 1, 'a', xmlDataBlock2);
            remoteDataBlock1.text = text.slice(currentTextPos, midPos);
            remoteDataBlock2.text = text.slice(currentTextPos + midPos, text.length);
            result.push(remoteDataBlock1);
            result.push(remoteDataBlock2);
        } else {
            result.push(remoteDataBlock1);
        }
    }

    /**
     * Compares the attributes field with the given block. If the attributes are matching, the function returns the
     * block, else null.
     * @param block that shall be compared to the attributes list
     * @param attributes that shall be checked
     * @returns {*} the block if the attributes are matching or null
     * @private
     */
    _getBlockIfEqualAttributes(block, attributes) {
        if (block === null)
            return null;
        if (attributes === null || attributes === undefined)
            if (block.getAttributes() === null)
                return block;
            else
                return null;
        if (!block.compareAttributes(attributes))
            return null;
        return block;
    }

    /**
     *
     * @param ops converts the remote block operations to JSON for submission (doc.sumbitOps function)
     * @returns {Promise<[any , any , any , any , any , any , any , any , any , any]>} promise array since the plaintext
     * must be encrypted first
     * @private
     */
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

    /**
     * Converts the remoteDataBlock (insert) into the delta format
     * @param remoteDataBlock remote block that shall be converted to an delta format
     * @returns {*} delta of the insertion
     * @private
     */
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

    /**
     * converts the remoteDataBlock (delete) into the delta format
     * @param remoteDataBlock remote block that shall be converted to an delta format
     * @returns {*} delta of the deletion
     * @private
     */
    _deleteTextInQuill(remoteDataBlock) {
        let dataBlockOffset = this.xmlDataCollection.getXmlDataBlockOffsetByPos(remoteDataBlock.pos);
        let localDataBlock = this.xmlDataCollection.getXmlDataBlockByBlockPosition(remoteDataBlock.pos);
        let delta = new Delta().retain(dataBlockOffset).delete(localDataBlock.length);
        this.xmlDataCollection.deleteAtIndex(remoteDataBlock.pos);
        return delta;
    }

    /**
     * converts the remoteDataBlock (replace) into the delta format
     * @param remoteDataBlock remote block that shall be converted to an delta format
     * @returns {*} delta of the replacement
     * @private
     */
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

    /**
     * Creates a new remoteDeltaBlock with the given text, position and attributes.
     * @param text of the remoteDataBlock
     * @param pos position of the remoteDataBlock within the xml document
     * @param attributes of the remoteDataBlock (formatting)
     * @returns {RemoteDataBlock} a new RemoteDataBlock
     * @private
     */
    _createRemoteDataBlock(text, pos, attributes) {
        let xmlDataBlock = new XmlDataBlock(null, this.documentKey);
        xmlDataBlock.init();
        xmlDataBlock.setAttributes(attributes);
        let xmlRemoteDataBlock = new RemoteDataBlock(pos, 'a', xmlDataBlock);
        xmlRemoteDataBlock.text = text;
        return xmlRemoteDataBlock;
    }

    /**
     * @returns {number} maximum length of any data block within the xml document
     * @constructor
     */
    get MAX_BLOCK_SIZE() {
        return this._MAX_BLOCK_SIZE;
    }

    /**
     * @returns {Delta} entire text of the document containing all formatting as delta. The result can be
     * inserted into quill
     */
    get documentTextWithFormatting() {
        return this.xmlDataCollection.textContentWithFormattingDelta;
    }

}

/**
 * Events of the XMLWrapper
 * @type {{REMOTE_UPDATE: string, TEXT_RELOAD: string, DOCUMENT_LOADED: string, DOCUMENT_ENCRYPTION_CHANGED: string}}
 */
XmlWrapper.events = {
    REMOTE_UPDATE: 'remote-update',
    TEXT_RELOAD: 'text-reload',
    DOCUMENT_LOADED: 'document-loaded',
    DOCUMENT_ENCRYPTION_CHANGED: 'document-encryption-changed'
};

export default XmlWrapper;
