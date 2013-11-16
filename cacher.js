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
 
(function (m) {
    "use strict";

    var mysql = require('mysql'), fs = require("fs"), http = require("http"), cacherInterval, cache, mysqlclient;

    // Connect to MySQL and select DB
    mysqlclient = mysql.createClient({
      user: '<user>',
      password: '<password>'
    });
    mysqlclient.useDatabase('nasa');

    cache = {
        saveFile: function (dataType) {

            var dataTypeURL = "", fileName, client, request, responseBody = "";

            switch (dataType) {
            case "rndz":
                dataTypeURL = "/realdata/tracking/veh.rndz";
                fileName = "veh.rndz";
                break;
            case "data":
                dataTypeURL = "/realdata/tracking/veh.data";
                fileName = "veh.data";
                break;
            case "sv":
                dataTypeURL = "/realdata/tracking/veh.sv";
                fileName = "veh.sv";
                break;
            default:
                console.log("Unspecified cache!");
                return;
            }

            client = http.createClient(80, "spaceflight1.nasa.gov", false);
            client.fileName = fileName;
            request = client.request("GET", dataTypeURL, {
                "host": "spaceflight1.nasa.gov"
            });

            request.end();

            request.on("response", function (response) {
                response.on("data", function (chunk) {
                    responseBody += chunk;
                });
                response.on("end", function () {
                    fs.writeFile(client.fileName, responseBody, function (err) {
                        if (err) {
                            console.warn(err);
                        } else {
                            console.log(new Date().toGMTString() + " - Successfully cached " + client.fileName + " to disk.");
                        }
                    });

                    // Save statevector into table
                    if(client.fileName === 'veh.sv') {
                        mysqlclient.query(
                          'INSERT INTO statevector '+
                          'SET data = ?, created = ?',
                          [responseBody, new Date()]
                        );
                        console.log(new Date().toGMTString() + " - Successfully saved " + client.fileName + " to database.");
                    }
                });
            });
        }
    };

    m.exports = {
        start: function () {
            console.log(new Date().toGMTString() + " - Cacher: started.");

            cacherInterval = setInterval(function () {
                cache.saveFile("data");
                cache.saveFile("sv");
            }, 15000);
        },
        stop: function () {
            console.log(new Date().toGMTString() + " - Cacher: stopped.");
            clearInterval(cacherInterval);
        }
    };
}(module));