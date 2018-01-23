import Module from 'quill/core/module';
import xmlEnc from 'xml-enc';
import shareDb from 'sharedb/lib/client';
import XmlWrapper from './xmlWrapper';
import Delta from 'quill-delta';
import StaticKeyData from './staticKeyData';

shareDb.types.register(xmlEnc.type);
var socket = new WebSocket('ws://' + window.location.host);
var connection = new shareDb.Connection(socket);

window.disconnect = function () {
    connection.close();
};

window.connect = function () {
    var socket = new WebSocket('ws://' + window.location.host);
    connection.bindToSocket(socket);
};

var doc = connection.get('test', 'xml-enc');

new Promise((resolve, reject) => {
    doc.subscribe(function (err) {
        if (err) {
            reject(err);
        } else {
            resolve(doc);
        }
    });
}).then((doc) => {
    if (doc.data === undefined)
        doc.create('<root><header><isEncrypted>false</isEncrypted></header><document></document></root>', 'xml-enc');
    let otExtender = window.quill.getModule('OtExtender');
    otExtender.shareDbDocumentLoaded(doc);
});

export class OtExtender extends Module {
    constructor(quill, options) {
        super(quill, options);
        this.quill = quill;
        this.options = options;
        this.xmlWrapper = null;
        this.shareDbDoc = null;
        quill.on('text-change', this.update.bind(this));
        quill.enable(false);
        let encryptionButton = document.querySelector('.ql-encryption');
        if (encryptionButton != null)
            encryptionButton.addEventListener('click', this.encryptDocument.bind(this));
        this.statusBar = document.querySelector(options.statusBar);
    }

    shareDbDocumentLoaded(doc) {
        this.shareDbDoc = doc;
        this.xmlWrapper = new XmlWrapper(this.shareDbDoc);
        this.xmlWrapper.on(XmlWrapper.events.REMOTE_UPDATE, this.remoteUpdate.bind(this));
        //TODO keyserver and check doc if encrypted
        //load private and public key
        this.xmlWrapper.loadPublicKey(StaticKeyData.publicKeyString).then(() => {
            this.xmlWrapper.loadPrivateKey(StaticKeyData.privateKeyString).then(() => {
                //only if the remote doc can be loaded allow editing
                this.xmlWrapper.shareDbDocumentLoaded().then((res) => {
                    window.quill.setContents(res.delta, 'api');
                    this.encryptionChanged(res.isEncrypted);
                    window.quill.enable();
                    this.xmlWrapper.on(XmlWrapper.events.DOCUMENT_ENCRYPTION_CHANGED, this.encryptionChanged.bind(this));
                });
            });
        });
        //remote updates
        this.shareDbDoc.on('op', function (op, source) {
            if (source === 'quill') return;
            this.xmlWrapper.remoteUpdate(op);
        }.bind(this));
    }

    update(delta, oldDelta, source) {
        if (source !== 'user') return;
        console.log(delta);
        console.log(oldDelta);
        this.xmlWrapper.quillTextChanged(delta, doc).then(() => {
            console.log(doc.data);
        });
    }

    remoteUpdate(op) {
        let delta = new Delta(op);
        this.quill.updateContents(delta);
    }

    encryptDocument() {
        this.xmlWrapper.encryptDocument();
    }

    encryptionChanged(isEncrypted) {
        if(this.statusBar !== null){
            if(isEncrypted){
                this.statusBar.style.backgroundColor = "green";
                this.statusBar.textContent = "encrypted";
            }else{
                this.statusBar.style.backgroundColor = "#E13737";
                this.statusBar.textContent = "unencrypted";
            }
        }
    }
}

if (window.Quill) {
    window.Quill.register('modules/OtExtender', OtExtender);
}