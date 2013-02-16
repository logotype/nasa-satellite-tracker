/**
 * Copyright © 2013 Victor Norgren
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:  The above copyright
 * notice and this permission notice shall be included in all copies or
 * substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE. 
 */
var express = require('express'),
    nasa = require('./nasa'),
    cacher = require('./cacher'),
    port = "8080",
    app = express.createServer();

app.configure(function () {
    "use strict";

    app.use(express.errorHandler({
        dumpExceptions: false,
        showStack: false
    }));
});

app.get('/nasa/:datatype', function (request, response) {
    "use strict";

    switch (request.params.datatype) {
    case "all":
        nasa.getComputed(response);
        break;
    case "statevector":
        nasa.getStateVector(response);
        break;
    case "startcacher":
        cacher.start();
        response.end(new Date().toGMTString() + " - Cacher: started.");
        break;
    case "endcacher":
        cacher.stop();
        response.end(new Date().toGMTString() + " - Cacher: stopped.");
        break;
    default:
        response.end("syntax error");
        break;
    }
});

// Start cacher by default
cacher.start();

app.listen(port);
console.log('Server running at http://<server>/nasa/ (nginx proxy port ' + port + ')');