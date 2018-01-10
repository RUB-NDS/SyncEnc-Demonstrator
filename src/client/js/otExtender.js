import Module from 'quill/core/module';
import xmlEnc from 'xml-enc';
import shareDb from 'sharedb/lib/client';
import XmlWrapper from './xmlWrapper';
import Delta from 'quill-delta';

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
var xmlWrapper = null;
var doc = connection.get('test', 'xml-enc');
xmlWrapper = new XmlWrapper(doc);

new Promise((resolve, reject) => {
    doc.subscribe(function (err) {
        if (err) {
            reject(err);
        } else {
            resolve(doc);
        }
    });
}).then((doc) => {
    xmlWrapper.shareDbDocumentLoaded();

    doc.on('op', function (op, source) {
        if (source === 'quill') return;
        xmlWrapper.remoteUpdate(op);
    });
});

export class OtExtender extends Module {
    constructor(quill, options) {
        super(quill, options);
        this.quill = quill;
        this.options = options;
        this.container = document.querySelector(options.container);
        quill.on('text-change', this.update.bind(this));
        xmlWrapper.on(XmlWrapper.events.REMOTE_UPDATE, this.remoteUpdate.bind(this));
        //TODO add new method for doc laoded enable doc after laoding !
        xmlWrapper.on(XmlWrapper.events.DOCUMENT_LOADED, this.reloadText.bind(this));
    }

    update(delta, oldDelta, source) {
        if (source !== 'user') return;
        console.log(delta);
        console.log(oldDelta);
        xmlWrapper.quillTextChanged(delta, doc).then(() => {
            console.log(doc.data);
        });
    }

    remoteUpdate(op) {
        let delta = new Delta(op);
        this.quill.updateContents(delta);
    }

    reloadText(delta) {
        this.quill.setContents(delta, 'api');
    }

}

if (window.Quill) {
    window.Quill.register('modules/OtExtender', OtExtender);
}
/*
<root>
    <header></header>
    <document>
        <block>
            <data>content of the block</data>
            <op>Future work -> can be used to send the operation executed in the given block</op>
        </block>
        <block>
            <data>content of the block</data>
            <op>Future work -> can be used to send the operation executed in the given block</op>
        </block>
    </document>
</root>
 */