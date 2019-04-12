# Quill module for collaborative encrypted working
This project extends the rich-text editor quill by a module for collaborative end-to-end encryption.
## Prerequisites
The server runs on HTTPS, therefore a certificate is required. Without providing a private key and the corresponding certificate the server will not start.

The private key (`privkey.pem`) and the certificate (`cert.pem`) must be copied into the root directory of the `SyncEnc-Demonstrator` folder. Afterwards the server can be started with npm start.
## Run application
install npm

    apt-get install npm

create installation folder %installdir% and clone the xml-enc plugin for sharedb

    mkdir %installdir%
    cd %installdir%
    git clone https://github.com/RUB-NDS/ottype-xml-enc.git
clone the quill with encryption repository

    git clone https://github.com/RUB-NDS/SyncEnc-Demonstrator.git
install ottype-xml-enc

    cd ottype-xml-enc
    npm install
    cd ..
install quill with encryption

    cd SyncEnc-Demonstrator
    npm install
  
start project 

    npm start
   go to http://localhost:8080
