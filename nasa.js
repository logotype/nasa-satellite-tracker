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

    var fs = require("fs"), http = require("http"), object = {}, index = 0, globalResponse, util, rndz, data, stateVector, cache;

    util = {
        time_GMT: 1.0,
        time_GMT_SERVER: 0.0,
        time_GAST: null,
        SPD: 86400.0,
        /* Earth flattening: 1/298.25642 according to IERS(2003) */
        EARTH_FLATTENING: 0.0033528196978961928128822843109295015342838219542767,
        EARTHRADIUS: 6378.1366,
        /* Days per Julian century */
        JULCENT: 36525.0,
        JULDAT1900: 2415020.0,
        /* Reference epoch (J2000.0), Julian Date */
        JULDAT2000: 2451545.0,
        magnitude: function (x, y, z) {
            return Math.sqrt((x * x) + (y * y) + (z * z));
        },
        reduce: function (value, min, max) {

            var returnValue = value + parseInt((max - value) / (max - min)) * (max - min);
            if (returnValue > max) {
                returnValue -= (max - min);
            }
            return returnValue;
        },
        setLocalGMT: function () {

            var nowDate, startOfYear, dateOffset;

            nowDate = new Date();
            startOfYear = new Date(nowDate.getFullYear(), 0, 1);
            dateOffset = (new Date(nowDate.getFullYear(), 0, 1)).getTimezoneOffset() / 60;
            util.time_GMT = (nowDate.getTime() - startOfYear.getTime()) / 3600000 + dateOffset;
            util.time_GMT += 24;
        },
        setGASTime: function (d) {

            var fraction, halfEpoch, correctedEpoch, time, gmsTime, time_GAST, corrections;

            fraction = d - parseInt(d);
            halfEpoch = (d + util.JULDAT1900) - 0.5;
            correctedEpoch = halfEpoch - fraction;
            time = (correctedEpoch - util.JULDAT2000) / util.JULCENT;

            /* 0h Greenwich Mean Sidereal time*/
            gmsTime = (24110.548409999999 + 8640184.8128660005 * time + 0.093104000000000006 * (time * time)) - 0.0000062 * (time * time * time);

            corrections = (1.0027379093507951 + 0.000000000059006000000000003 * time) - 0.0000000000000058999999999999996 * (time * time);

            time_GAST = gmsTime + corrections * fraction * util.SPD;

            /* Seconds of time per radian */
            time_GAST *= 0.00007272205216643039903848712;

            time_GAST = util.reduce(time_GAST, 0, (Math.PI * 2));

            util.time_GAST = time_GAST;
        },
        calculatePosition: function (x, y, z) {

            var vector, newVector, vectorZ, latitudeAngle, longitudeAngle, previousLatitudeAngle, equinoxCoffecient, correction, returnObject, vectorMagnitude;

            vector = {};
            vector.x = x;
            vector.y = y;
            vector.z = z;

            newVector = {};
            newVector.x = vector.x;
            newVector.y = vector.y;
            newVector.z = 0.0;
            vectorMagnitude = Math.sqrt((newVector.x * newVector.x) + (newVector.y * newVector.y) + (newVector.z * newVector.z));

            newVector.x /= vectorMagnitude;
            newVector.y /= vectorMagnitude;

            longitudeAngle = Math.atan2(newVector.y, newVector.x) - util.time_GAST;
            longitudeAngle = util.reduce(longitudeAngle, -Math.PI, Math.PI);
            vectorZ = vector.z;
            latitudeAngle = Math.atan(vectorZ / vectorMagnitude);
            equinoxCoffecient = 0.006705621364635388 - (util.EARTH_FLATTENING * util.EARTH_FLATTENING);
            do {
                previousLatitudeAngle = latitudeAngle;
                correction = 1.0 / Math.sqrt(1.0 - equinoxCoffecient * (Math.sin(previousLatitudeAngle) * Math.sin(previousLatitudeAngle)));
                latitudeAngle = Math.atan((vectorZ + util.EARTHRADIUS * correction * equinoxCoffecient * Math.sin(previousLatitudeAngle)) / vectorMagnitude);
            } while (Math.abs(previousLatitudeAngle - latitudeAngle) > 9.9999999999999995E-07);

            returnObject = {};
            returnObject.latitude = (latitudeAngle * 360) / 6.2831853071795862;
            returnObject.longitude = (longitudeAngle * 360) / 6.2831853071795862;

            return returnObject;
        },
        correctPosition: function (statevector, d) {

            var its = 0,
                a = 0,
                ap = 0,
                alpha = 0,
                sig0 = 0,
                c0 = 0,
                c1 = 0,
                c2 = 0,
                c3 = 0,
                c4 = 0,
                c5x3 = 0,
                s1 = 0,
                s2 = 0,
                s3 = 0,
                psi = 0,
                psin = 0,
                psip = 0,
                dtau = 0,
                dtaun = 0,
                dtaup = 0,
                fm1 = 0,
                g = 0,
                fd = 0,
                gdm1 = 0,
                loopexit = false,
                m = 0,
                r = 0,
                r0 = 0,
                s = [],
                s0 = [],
                stateVectorPrepared;

            s0[0] = statevector.x;
            s0[1] = statevector.y;
            s0[2] = statevector.z;
            s0[3] = statevector.velocityX;
            s0[4] = statevector.velocityY;
            s0[5] = statevector.velocityZ;

            r0 = Math.sqrt(s0[0] * s0[0] + s0[1] * s0[1] + s0[2] * s0[2]);
            sig0 = s0[0] * s0[3] + s0[1] * s0[4] + s0[2] * s0[5];
            alpha = (s0[3] * s0[3] + s0[4] * s0[4] + s0[5] * s0[5]) - 797201.59990000003 / r0;

            m = 0;
            if (d === 0.0) {
                psi = 0.0;
            } else {
                if (d < 0) {
                    psin = -1;
                    psip = 0;
                    dtaun = psin;
                    dtaup = -d;
                } else {
                    psin = 0;
                    psip = 1;
                    dtaun = -d;
                    dtaup = psip;
                }
                if (psi <= psin || psi >= psip) {
                    psi = d / r0;
                    if (psi <= psin || psi >= psip) {
                        psi = d;
                    }
                }
            }
            loopexit = false;
            its = 0;
            do {
                its++;
                a = alpha * psi * psi;
                if (Math.abs(a) > 1.0) {
                    ap = a;
                    for (m; Math.abs(a) > 1.0; a *= 0.25) {
                        m++;
                    }
                }
                c5x3 = (1.0 + ((1.0 + ((1.0 + ((1.0 + ((1.0 + ((1.0 + ((1.0 + a / 342) * a) / 272) * a) / 210) * a) / 156) * a) / 110) * a) / 72) * a) / 42) / 40;
                c4 = (1.0 + ((1.0 + ((1.0 + ((1.0 + ((1.0 + ((1.0 + ((1.0 + a / 306) * a) / 240) * a) / 182) * a) / 132) * a) / 90) * a) / 56) * a) / 30) / 24;
                c3 = (0.5 + a * c5x3) / 3;
                c2 = 0.5 + a * c4;
                c1 = 1.0 + a * c3;
                c0 = 1.0 + a * c2;
                if (m > 0) {
                    for (m; m > 0; m--) {
                        c1 = c1 * c0;
                        c0 = 2 * c0 * c0 - 1.0;
                    }

                    c2 = (c0 - 1.0) / ap;
                    c3 = (c1 - 1.0) / ap;
                    c4 = (c2 - 0.5) / ap;
                    c5x3 = (3 * c3 - 0.5) / ap;
                }
                s1 = c1 * psi;
                s2 = c2 * psi * psi;
                s3 = c3 * psi * psi * psi;
                g = r0 * s1 + sig0 * s2;
                dtau = (g + 398600.8 * s3) - d;
                r = Math.abs(r0 * c0 + (sig0 * s1 + 398600.8 * s2));
                if (dtau === 0.0) {
                    loopexit = true;
                } else {
                    if (dtau < 0.0) {
                        psin = psi;
                        dtaun = dtau;
                    } else {
                        psip = psi;
                        dtaup = dtau;
                    }
                    psi = psi - dtau / r;
                    if (psi <= psin || psi >= psip) {
                        if (Math.abs(dtaun) < Math.abs(dtaup)) {
                            psi = psin * (1.0 - (4 * dtaun) / d);
                        }
                        if (Math.abs(dtaup) < Math.abs(dtaun)) {
                            psi = psip * (1.0 - (4 * dtaup) / d);
                        }
                        if (psi <= psin || psi >= psip) {
                            if (d > 0.0) {
                                psi = psin + psin;
                            }
                            if (d < 0.0) {
                                psi = psip + psip;
                            }
                            if (psi <= psin || psi >= psip) {
                                psi = psin + (psip - psin) * (-dtaun / (dtaup - dtaun));
                                if (psi <= psin || psi >= psip) {
                                    psi = psin + (psip - psin) * 0.5;
                                    if (psi <= psin || psi >= psip) {
                                        loopexit = true;
                                    }
                                }
                            }
                        }
                    }
                }
            } while (loopexit === false && its <= 10);
            fm1 = (-398600.8 * s2) / r0;
            fd = (-398600.8 * s1) / (r0 * r);
            gdm1 = (-398600.8 * s2) / r;

            stateVectorPrepared = {};

            stateVectorPrepared.x = s[0] = s0[0] + (fm1 * s0[0] + g * s0[3]);
            stateVectorPrepared.y = s[1] = s0[1] + (fm1 * s0[1] + g * s0[4]);
            stateVectorPrepared.z = s[2] = s0[2] + (fm1 * s0[2] + g * s0[5]);
            stateVectorPrepared.velocityX = s[3] = fd * s0[0] + gdm1 * s0[3] + s0[3];
            stateVectorPrepared.velocityY = s[4] = fd * s0[1] + gdm1 * s0[4] + s0[4];
            stateVectorPrepared.velocityZ = s[5] = fd * s0[2] + gdm1 * s0[5] + s0[5];

            return stateVectorPrepared;
        },
        rad2deg: function (radians) {
            "use strict";

            return (180 * radians / Math.PI);
        },
        deg2rad: function(degrees) {
            "use strict";

            return (Math.PI * degrees / 180);
        },
        julianDateOfYear: function (year) {
            "use strict";
            var rYr = year - 1;
            var A = Math.floor(rYr / 100);
            var B = 2 - A + Math.floor(A / 4);
            return (Math.floor(365.25 * rYr) + 428 + 1720994.5 + B);
        }
    };

    rndz = {
        parseData: function (rawData) {

            var lookAngle = {},
                array;

            // Trim multiple spaces into one
            rawData = rawData.replace(/\s+/g, " ");

            // Split the text into an array for each parameter
            array = rawData.split(" ");

            // Spherical coordinate system
            lookAngle.description = "Air Force Satellite Control Network, frame of reference";
            lookAngle.type = "Metric data";
            lookAngle.range = array[0];
            lookAngle.rate = array[1];
            lookAngle.azimuth = array[2];
            lookAngle.elevation = array[3];

            object.lookAngle = lookAngle;
        }
    };

    data = {
        parseData: function (rawData) {

            var i = 0, arrayLines = rawData.split("\n"), text, array;

            // Trim multiple spaces into one
            text = arrayLines[0].replace(/\s+/g, " ");

            // Split the text into an array for each parameter
            array = text.split(" ");

            // Set time_GMT based on first token
            util.time_GMT_SERVER = parseFloat(array[1]);

            for (i; i < arrayLines.length; i++) {

                if (arrayLines[i].toLowerCase().substr(0, 3) === "iss") {
                    data.parseLine(arrayLines[i]);
                    return;
                }
            }
        },
        parseDataRaw: function (rawData) {

            var i = 0, arrayLines = rawData.split("\n"), text, array;

            // Trim multiple spaces into one
            text = arrayLines[0].replace(/\s+/g, " ");

            // Split the text into an array for each parameter
            array = text.split(" ");

            // Set time_GMT based on first token
            util.time_GMT_SERVER = parseFloat(array[1]);


            for (i; i < arrayLines.length; i++) {

                if (arrayLines[i].toLowerCase().substr(0, 3) === "iss") {
                    data.parseLineRaw(arrayLines[i]);
                    return;
                }
            }
        },
        parseLineRaw: function (text) {

            console.log(new Date().toGMTString() + " - Parsing Cartesian vector (raw data)...");

            var info = {},
                attitude = {},
                array;

            // Trim multiple spaces into one
            text = text.replace(/\s+/g, " ");

            // Split the text into an array for each parameter
            array = text.split(" ");

            // ISS signal boolean
            info.signal = (parseInt(array[1], 2) === 1) ? true : false;

            // ISS rotation
            attitude.roll = parseFloat(array[2]);
            attitude.pitch = parseFloat(array[3]);
            attitude.yaw = parseFloat(array[4]);

            // ISS atmosphere
            info.temperatureF = parseFloat(array[5]);
            info.temperatureC = (5.0/9.0) * (parseFloat(array[5])-32.0);
            info.humidity = parseFloat(array[6]);
            info.airpressure = parseFloat(array[7]);

            // ISS phase of mission
            info.phase = data.parsePhase(parseInt(array[8]));

            object.info = info;
            object.attitude = attitude;
        },
        parseLine: function (text) {

            console.log(new Date().toGMTString() + " - Parsing Cartesian vector...");

            var info = {},
                attitude = {},
                array;

            // Trim multiple spaces into one
            text = text.replace(/\s+/g, " ");

            // Split the text into an array for each parameter
            array = text.split(" ");

            // ISS signal boolean
            info.description = "International Space Station";
            info.type = "Space Station";
            info.signal = (parseInt(array[1], 2) === 1) ? true : false;

            // Attitude info
            attitude.description = "Flight Dynamics";
            attitude.type = "Orientation";

            // ISS rotation
            attitude.roll = parseFloat(array[2]);
            attitude.pitch = parseFloat(array[3]);
            attitude.yaw = parseFloat(array[4]);

            // ISS atmosphere
            info.temperatureF = parseFloat(array[5]);
            info.temperatureC = (5.0/9.0) * (parseFloat(array[5])-32.0);
            info.humidity = parseFloat(array[6]);
            info.airpressure = parseFloat(array[7]);

            // ISS phase of mission
            info.phase = data.parsePhase(parseInt(array[8]));

            object.info = info;
            object.attitude = attitude;
        },
        parsePhase: function (phase) {

            var returnValue = "On Orbit";

            if (phase === 901 || phase === 0) {
                returnValue = "Pre-Launch";
            } else if (phase === 101) {
                returnValue = "Countdown";
            } else if (phase === 102) {
                returnValue = "1st Stage";
            } else if (phase === 103) {
                returnValue = "2nd Stage";
            } else if (phase === 104) {
                returnValue = "OMS 1";
            } else if (phase === 105) {
                returnValue = "OMS 2";
            } else if (phase === 106) {
                returnValue = "Coast phase";
            } else if (phase === 201) {
                returnValue = "Orbit Coast";
            } else if (phase === 202) {
                returnValue = "Maneuver";
            } else if (phase === 801) {
                returnValue = "FCS c/o";
            } else if (phase === 301) {
                returnValue = "DeOrbit";
            } else if (phase === 302) {
                returnValue = "DeOrbit Exec";
            } else if (phase === 303) {
                returnValue = "PreEntry";
            } else if (phase === 304) {
                returnValue = "Entry";
            } else if (phase === 305) {
                returnValue = "TAEM/Landing";
            } else if (phase === 601) {
                returnValue = "RTLS 2nd";
            } else if (phase === 602) {
                returnValue = "Glide RTLS 1";
            } else if (phase === 603) {
                returnValue = "Glide RTLS 2";
            } else {
                returnValue = "On Orbit";
            }

            return returnValue;
        }
    };

    stateVector = {
        parseStateVector: function (text) {

            var i = 0, arrayLines = text.split("\n"), state = {}, array;

            for (i; i < arrayLines.length; i++) {
                if (    arrayLines.length >= (i+2) &&
                        arrayLines[i].toLowerCase().substr(0, 3) === "iss" &&
                        arrayLines[i+1].toLowerCase().substr(0, 1) === "1" &&
                        arrayLines[i+2].toLowerCase().substr(0, 1) === "2") {
                    stateVector.parseTwoLineElement(arrayLines[i+1], arrayLines[i+2]);
                }
            }

            // Trim multiple spaces into one
            text = text.replace(/\s+/g, " ");

            // Split the text into an array for each parameter
            array = text.split(" ");

            // ISS position
            state.x = parseFloat(array[2]) * 0.0003048;
            state.y = parseFloat(array[3]) * 0.0003048;
            state.z = parseFloat(array[4]) * 0.0003048;

            // ISS velocity
            state.velocityX = parseFloat(array[5]) * 0.0003048;
            state.velocityY = parseFloat(array[6]) * 0.0003048;
            state.velocityZ = parseFloat(array[7]) * 0.0003048;
            state.time = parseFloat(array[8]);
            state.gmt = util.time_GMT;

            object.stateVector = state;
        },
        parseData: function (rawData) {

            var i = 0,
                arrayLines = rawData.split("\n"),
                currentLine;

            for (i; i < arrayLines.length; i++) {
                currentLine = arrayLines[i];

                if (currentLine.toLowerCase().substr(0, 1) === "c") {
                    stateVector.parseLine(currentLine);
                }

                if (    arrayLines.length >= (i+2) &&
                        arrayLines[i].toLowerCase().substr(0, 3) === "iss" &&
                        arrayLines[i+1].toLowerCase().substr(0, 1) === "1" &&
                        arrayLines[i+2].toLowerCase().substr(0, 1) === "2") {
                    stateVector.parseTwoLineElement(arrayLines[i+1], arrayLines[i+2]);
                }
            }
        },
        parseLine: function (text) {

            var state = {}, compute = {}, array, stateVectorPrepared, positionObject, diff;

            // Trim multiple spaces into one
            text = text.replace(/\s+/g, " ");

            // Split the text into an array for each parameter
            array = text.split(" ");

            // Some info
            state.description = "position (ft), velocity (ft/sec)";
            state.type = "Earth-centered inertial (ECI), Cartesian systems of Mean of 1950 (M50)";

            // ISS position
            state.x = parseFloat(array[1]) * 0.0003048;
            state.y = parseFloat(array[2]) * 0.0003048;
            state.z = parseFloat(array[3]) * 0.0003048;

            // ISS velocity
            state.velocityX = parseFloat(array[4]) * 0.0003048;
            state.velocityY = parseFloat(array[5]) * 0.0003048;
            state.velocityZ = parseFloat(array[6]) * 0.0003048;
            state.time = parseFloat(array[7]);

            // Sets the util.time_GMT variable (can also use the server's GMT value, but offset is huge)
            util.setLocalGMT();

            // Set Apparent Sidereal time
            util.setGASTime(util.time_GMT / 24);

            // Some heavy computation here
            diff = (util.time_GMT - state.time) * 60;
            stateVectorPrepared = util.correctPosition(state, diff);
            console.log("time_GMT: " + util.time_GMT + " time_GMT_SERVER: " + util.time_GMT_SERVER + " GAST: " + util.time_GAST + " sv.time:" + state.time + " diff: " + diff);

            positionObject = util.calculatePosition(stateVectorPrepared.x / 0.0003048, stateVectorPrepared.y / 0.0003048, stateVectorPrepared.z / 0.0003048);

            compute.propagatedStateVector = {};
            compute.propagatedStateVector.x = stateVectorPrepared.x;
            compute.propagatedStateVector.y = stateVectorPrepared.y;
            compute.propagatedStateVector.z = stateVectorPrepared.z;
            compute.propagatedStateVector.velocityX = stateVectorPrepared.velocityX;
            compute.propagatedStateVector.velocityY = stateVectorPrepared.velocityY;
            compute.propagatedStateVector.velocityZ = stateVectorPrepared.velocityZ;
            compute.propagatedStateVector.time = util.time_GMT;

            // Some heavy computation here
            compute.altitude = {};
            compute.altitude.description = "kilometers (km), nautical miles (nm), statute miles (sm)";
            compute.altitude.km = util.magnitude(stateVectorPrepared.x, stateVectorPrepared.y, stateVectorPrepared.z) - util.EARTHRADIUS;
            compute.altitude.nm = (util.magnitude(stateVectorPrepared.x, stateVectorPrepared.y, stateVectorPrepared.z) - util.EARTHRADIUS) / 1.852000000000000;
            compute.altitude.sm = (util.magnitude(stateVectorPrepared.x, stateVectorPrepared.y, stateVectorPrepared.z) - util.EARTHRADIUS) / 1.6093440000000001;

            compute.speed = {};
            compute.speed.description = "meters per second (mps), kilometers per hour (kph), miles per hour (mph)";
            compute.speed.mps = util.magnitude(stateVectorPrepared.velocityX, stateVectorPrepared.velocityY, stateVectorPrepared.velocityZ) * 1000;
            compute.speed.kph = (util.magnitude(stateVectorPrepared.velocityX, stateVectorPrepared.velocityY, stateVectorPrepared.velocityZ) * 1000 / 1000) * 3600;
            compute.speed.mph = (util.magnitude(stateVectorPrepared.velocityX, stateVectorPrepared.velocityY, stateVectorPrepared.velocityZ) * 1000 / 1609.3440000000001) * 3600;

            // Long/Lat (approx)
            compute.location = {};
            compute.location.latitude = positionObject.latitude;
            compute.location.longitude = positionObject.longitude;

            object.stateVector = state;
            object.compute = compute;
        },
        parseTwoLineElement: function (line1, line2) {
            "use strict";

            console.log(new Date().toGMTString() + " - Parsing Two-Line-Element set...");

            var keplarian = {};

            keplarian.description = "Keplarian elements";
            keplarian.type = "epoch time (0), drag (float), inclination (rad), right ascension (longitude), perigee (rad), eccentricity (float), mean anomaly (rad), mean motion (float)";

            keplarian.satellite = parseInt(line1.substr(2, 7));
            keplarian.classification = line1.substr(7, 1);
            keplarian.designator = {};
            keplarian.designator.launchYear = line1.substr(9, 2);
            keplarian.designator.launchNumber = Math.floor(line1.substr(11, 3));
            keplarian.designator.launchPiece = line1.substr(14, 1);
            keplarian.epochYear = line1.substring(18, 20) * 1;
            keplarian.epoch = parseFloat(line1.substring(20, 32));
            keplarian.epochFirstDerivate = parseFloat(line1.substr(33, 10));
            keplarian.epochSecondDerivate = parseFloat(line1.substr(45, 7));
            keplarian.drag = parseFloat(line1.substring(53, 59)) * Math.pow(10, -5 + parseInt(line1.substring(59, 61)));

            keplarian.inclination = util.deg2rad(parseFloat(line2.substring(8, 16)));
            keplarian.rightAscending = util.deg2rad(parseFloat(line2.substring(17, 25)));
            keplarian.eccentricity = parseFloat(line2.substring(26, 33)) * 1e-7;
            keplarian.perigee = util.deg2rad(parseFloat(line2.substring(34, 42)));
            keplarian.meanAnomaly = util.deg2rad(parseFloat(line2.substring(43, 51)));
            keplarian.meanMotion = parseFloat(line2.substring(52, 63)) * (Math.PI * 2) / 1440;

            if (keplarian.epochYear < 57) {
                keplarian.epochYear+=2000;
            } else {
                keplarian.epochYear+=1900;
            }

            keplarian.julianEpoch = util.julianDateOfYear(keplarian.epochYear)+keplarian.epoch;

            object.keplarian = keplarian;
        }
    };

    cache = {
        loadFile: function (fileName) {

            fs.readFile(fileName, function (err, fileData) {
                if (err) {
                    console.error("Could not open file: %s", err);
                }

                switch (fileName) {
                case "veh.rndz":
                    rndz.parseData(fileData.toString());
                    break;
                case "veh.data":
                    data.parseData(fileData.toString());
                    break;
                case "veh.sv":
                    stateVector.parseData(fileData.toString());
                    break;
                default:
                    console.log("Unspecified file to read from cache!");
                    return;
                }

                index++;

                if (index === 3) {
                    globalResponse.end(JSON.stringify(object));
                }
            });

        },
        readFile: function (fileName) {

            fs.readFile(fileName, function (err, fileData) {
                if (err) {
                    console.error("Could not open file: %s", err);
                }

                switch (fileName) {
                case "veh.data":
                    data.parseDataRaw(fileData.toString());
                    break;
                case "veh.sv":
                    stateVector.parseStateVector(fileData.toString());
                    break;
                default:
                    console.log("Unspecified file to read from cache!");
                    return;
                }

                index++;

                if (index === 2) {
                    globalResponse.end(JSON.stringify(object));
                }
            });

        },
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
                            console.log(err);
                        } else {
                            console.log("Cached: " + client.fileName);
                        }
                    });
                });
            });
        }
    };

    m.exports = {
        getComputed: function (response) {

            var lookAngle = {};

            index = 0;

            object = {};
            object.info = {};
            object.attitude = {};
            object.stateVector = {};
            object.compute = {};
            object.keplarian = {};

            globalResponse = response;

            response.removeHeader("X-Powered-By");
            response.header("Content-Type", "application/json");
            response.header("Data-Source-Protocol", "ISP (Information Sharing Protocol)");
            response.header("Data-Origin", "Mission Control Center");

            util.setLocalGMT();

            // Hardcode this data to save one request
            lookAngle.description = "Air Force Satellite Control Network, frame of reference";
            lookAngle.type = "Metric data";
            lookAngle.range = 774.6;
            lookAngle.rate = 1.03;
            lookAngle.azimuth = -2.09;
            lookAngle.elevation = -19.97;
            object.lookAngle = lookAngle;

            index++;

            cache.loadFile("veh.data");
            cache.loadFile("veh.sv");
        },
        getStateVector: function (response) {

            index = 0;
            object = {};
            object.info = {};
            object.attitude = {};

            globalResponse = response;

            response.removeHeader("X-Powered-By");
            response.header("Content-Type", "application/json");
            response.header("Access-Control-Allow-Origin", "*");
            response.header("Data-Source-Protocol", "ISP (Information Sharing Protocol)");
            response.header("Data-Origin", "Mission Control Center");

            util.setLocalGMT();

            cache.readFile("veh.data");
            cache.readFile("veh.sv");
        }
    };
}(module));