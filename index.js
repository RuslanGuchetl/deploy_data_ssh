'use strict';

const Client = require('ssh2-sftp-client');
const config = require('./config.js');
const fs = require('fs');
let path = require('path');

const remoteDir = config.remoteDir;
const localDir = config.localDir;
const defaultConfig = config.defaultConfig;
const filesOrder = config.filesOrder;

let files = [];
let result = [];
let lowPriorityArray = [];

const bypass = (dir, done, rootPath) => {
    let results = [];
    rootPath = rootPath || `${__dirname}/${dir}/`;
    rootPath = rootPath.replace(/\/deploy/g, '');
    fs.readdir(dir, (err, list) => {
        if (err) {
            return done(err);
        }
        let pending = list.length;
        if (!pending) {
            return done(null, results);
        }
        list.forEach((file) => {
            file = path.resolve(dir, file);
            fs.stat(file, (err, stat) => {
                if (stat && stat.isDirectory()) {
                    bypass(file, (err, res) => {
                        results = results.concat(res);
                        if (!--pending) done(null, results);
                    }, rootPath);
                } else {
                    results.push(file.replace(rootPath, ''));
                    if (!--pending) {
                        done(null, results);
                    }
                }
            });
        });
    });
};

bypass(localDir, (err, results) => {
    if (err) throw err;
    files = results;
});

const createDirIfNotExist = (path) => {
    return new Promise((resolve, reject) => {
        sftp.exists(path + '/').then(result => {
            if (!!result) {
                return resolve(`${path} exists`)
            }
            sftp.mkdir(path, true)
                .then(resolve)
                .catch(reject)
        }).catch(reject)
    });
};

const getLowPriority = async (idx, arr) => {
    let index = 0;

    for (const lowPriorityFiles of arr) {
        lowPriorityArray.push(lowPriorityFiles);
        result[idx][index] = lowPriorityFiles;
        ++index;
    }
};

const getArrayWithPriority = async () => {
    result = Object.values(filesOrder);
    lowPriorityArray = [];
    let idx = 0;

    for (const arr of result) {
        await getLowPriority(idx, arr);
        ++idx;
    }

    result.unshift(files.filter((path) => !lowPriorityArray.includes(path)));

    return result;
};

const uploadFilesAsync = async arr => {
    const isFolderCreated = {};

    for (const item of arr) {
        try {
            let localPath = `${localDir}/${item}`;
            let remotePath = `${remoteDir}/${item}`;
            let fileDir = path.dirname(remotePath);

            if (!isFolderCreated[fileDir]) {
                await createDirIfNotExist(fileDir);
                isFolderCreated[fileDir] = true;
            }

            await sftp.put(localPath, remotePath, {flag: 'w'});
            console.log(item, ': UPLOADED');
        } catch (e) {
            console.log(item, ': ERROR', e)
        }
    }
};

const upload = async () => {
    let resultArray = await getArrayWithPriority();

    for (const arr of resultArray) {
        await uploadFilesAsync(arr);
    }
};

const sftp = new Client();
(async () => {
    try {
        await sftp.connect(defaultConfig);
        const p = await sftp.cwd();
        console.log(`Remote working directory is ${p}`);
        await upload();
        await sftp.end();
        console.log('------------Deploy was completed------------');
    } catch (e) {
        console.log(`ERROR: ${e.message}`);
    }
})();
