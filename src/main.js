/**
 * 画像解析BOT
 */
const LINE_CHANNEL_TOKEN = '*****'; // LINE NOTIFYのアクセストークン
const GOOGLE_API_KEY = '*****';
const SSID = '*****';
const SSN_USER = 'user';

let spreadsheet = SpreadsheetApp.openById(SSID);
let userSheet = spreadsheet.getSheetByName(SSN_USER);

/**
 * POSTリクエスト
 * @param {Object} event 
 */
function doPost(event) {
    try {
        if (event.postData) {
            let reqObj = JSON.parse(event.postData.contents);
            execute(reqObj);
        }
    } catch (e) {
        console.error(e.stack);
    }
}

/**
 * イベント処理
 * @param {Object} reqObj 
 */
function execute(reqObj) {

    for (let i in reqObj.events) {
        let reqEvent = reqObj.events[i];
        console.log(reqEvent);

        switch (reqEvent.type) {
            case 'follow':
                executeFollow(reqEvent);
                break;
            case 'unfollow':
                executeUnfollow(reqEvent);
                break;
            case 'message':
                executeMessage(reqEvent);
                break;
        }
    }
}

/**
 * Followイベント処理
 * @param {Object} reqEvent 
 */
function executeFollow(reqEvent) {
    let msgList = [{
        'type': 'text',
        'text': '画像をアップロードすると解析します。\n（Powered BY Google Cloud Vision API）',
    }];
    sendLinePush(reqEvent.source.userId, msgList);

    let user = getUser(reqEvent.source.userId);
    if (user) {
        userSheet.getRange(user.index + 2, 3).setValue(1);
    } else {
        userSheet.appendRow([reqEvent.source.type, reqEvent.source.userId, 1]);
    }
}

/**
 * UnFollowイベント処理
 * @param {Object} reqEvent 
 */
function executeUnfollow(reqEvent) {
    let user = getUser(reqEvent.source.userId);
    if (user) {
        userSheet.getRange(user.index + 2, 3).setValue(0);
    }
}

/**
 * メッセージイベント処理
 * @param {Object} reqEvent 
 */
function executeMessage(reqEvent) {
    let msgList = [];
    let user = getUser(reqEvent.source.userId);
    if (user) {
        switch (reqEvent.message.type) {
            case 'image':
                let content = getLineContent(reqEvent.message.id);
                let result = getAnnotate(content.getBlob());
                console.log(result);

                for (let i in result.responses) {
                    let retObj = result.responses[i];
                    for (let key of Object.keys(retObj)) {
                        let msg = null;
                        let value = retObj[key];
                        switch (key) {
                            case 'webDetection':
                                msg = getMsgWebDetection(value);
                                break;
                            case 'labelAnnotations':
                                msg = getMsgLabelAnnt(value);
                                break;
                            case 'textAnnotations':
                                msg = getMsgTextAnnt(value);
                                break;
                            case 'landmarkAnnotations':
                                msg = getMsglandmarkAnnt(value);
                                break;
                            case 'logoAnnotations':
                                msg = getMsglogoAnnt(value);
                                break;
                        }
                        if (msg) {
                            msgList.push({
                                'type': 'text',
                                'text': msg,
                            });
                        }
                    }
                }
                if (0 < msgList.length) {
                    console.log(JSON.stringify(msgList).replace('\n', ''));
                    sendLineReply(reqEvent.replyToken, msgList);
                }
                break;
        }
    }
}

/**
 * WEB検出のメッセージを取得する
 * @param {Object} value 
 */
function getMsgWebDetection(value) {
    let msg = `【WEBの検出】\n\n`;
    for (let i in value.webEntities) {
        let item = value.webEntities[i];
        msg += `- ${LanguageApp.translate(item.description, 'en', 'ja')}\n`;
    }
    for (let key of Object.keys(value)) {
        switch (key) {
            case 'fullMatchingImages':
                msg += `\n<< 完全一致 >>\n`;
                for (let j in value[key]) {
                    let item = value[key][j];
                    msg += `[${parseInt(j) + 1}] ${item.url}\n`;
                }
                break;
            case 'partialMatchingImages':
                msg += `\n<< 部分一致 >>\n`;
                for (let j in value[key]) {
                    let item = value[key][j];
                    msg += `[${parseInt(j) + 1}] ${item.url}\n`;
                }
                break;
            case 'visuallySimilarImages':
                msg += `\n<< 類似 >>\n`;
                for (let j in value[key]) {
                    let item = value[key][j];
                    msg += `[${parseInt(j) + 1}] ${item.url}\n`;
                }
                break;
        }
    }
    return msg;
}

/**
 * ラベル検出のメッセージを取得する
 * @param {Array} value 
 */
function getMsgLabelAnnt(value) {
    let msg = '【ラベルの検出】\n\n';
    for (let i in value) {
        let item = value[i];
        msg += `- ${LanguageApp.translate(item.description, 'en', 'ja')}\n`;
    }
    return msg;
}

/**
 * 文字検出のメッセージを取得する
 * @param {Array} value 
 */
function getMsgTextAnnt(value) {
    return `【文字の検出】\n\n${value[0].description}\n`;
}

/**
 * 場所検出のメッセージを取得する
 * @param {Array} value 
 */
function getMsglandmarkAnnt(value) {
    let msg = '【場所の検出】\n\n';
    for (let i in value) {
        let item = value[i];
        msg += `- ${LanguageApp.translate(item.description, 'en', 'ja')}\n`;
        for (let j in item.locations) {
            let loc = item.locations[j];
            msg += `https://www.google.com/maps?q=${loc.latLng.latitude},${loc.latLng.longitude}\n`;
        }
        msg += `\n`;
    }
    return msg;
}

/**
 * ロゴ検出のメッセージを取得する
 * @param {Array} value 
 */
function getMsglogoAnnt(value) {
    let msg = '【ロゴの検出】\n\n';
    for (let i in value) {
        let item = value[i];
        msg += `- ${item.description}\n`;
    }
    return msg;
}

/**
 * ユーザーIDを取得する
 * @param {String} userId 
 */
function getUser(userId) {
    let userList = getUserList();
    for (let i in userList) {
        let user = userList[i];
        if (user.userId === userId) {
            return {
                index: parseInt(i),
                item: user
            };
        }
    }
    return null;
}

/**
 * ユーザー一覧を取得する
 */
function getUserList() {
    let userList = [];
    let lastRow = userSheet.getLastRow();
    if (1 < lastRow) {
        userList = userSheet.getRange(2, 1, lastRow, 3).getValues();
        userList = userList.map((row) => {
            return {
                type: row[0],
                userId: row[1],
                follow: row[2],
            }
        });
    }
    return userList;
}

/**
 * LINEからコンテンツを取得する
 * @param {Object} file ファイル
 */
function getAnnotate(file) {
    let url = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_API_KEY}`;
    let options = {
        'method': 'get',
        'headers': {
            'Content-Type': 'application/json; charset=UTF-8',
        },
        'payload': JSON.stringify({
            requests: [{
                image: {
                    content: Utilities.base64Encode(file.getBytes())
                },
                features: [{
                        type: 'WEB_DETECTION',
                        maxResults: 5
                    },
                    {
                        type: 'LABEL_DETECTION',
                        maxResults: 5
                    },
                    {
                        type: 'TEXT_DETECTION',
                        maxResults: 5
                    },
                    {
                        type: 'LANDMARK_DETECTION',
                        maxResults: 5
                    },
                    {
                        type: 'LOGO_DETECTION',
                        maxResults: 5
                    },
                ],
            }]
        })
    };
    let response = UrlFetchApp.fetch(url, options);
    return JSON.parse(response.getContentText('UTF-8'));
}

/**
 * LINEからコンテンツを取得する
 * @param {String} messageId メッセージID
 */
function getLineContent(messageId) {
    let url = `https://api.line.me/v2/bot/message/${messageId}/content`;
    let options = {
        'method': 'get',
        'headers': {
            'Content-Type': 'application/json; charset=UTF-8',
            'Authorization': `Bearer ${LINE_CHANNEL_TOKEN}`
        }
    };
    return UrlFetchApp.fetch(url, options);
}

/**
 * LINEにメッセージを送信する
 * @param {String} targetId ターゲットID（userId/groupId/roomId）
 * @param {Object} msgList メッセージリスト
 */
function sendLinePush(targetId, msgList) {
    let url = 'https://api.line.me/v2/bot/message/push';
    let options = {
        'method': 'post',
        'headers': {
            'Content-Type': 'application/json; charset=UTF-8',
            'Authorization': `Bearer ${LINE_CHANNEL_TOKEN}`
        },
        'payload': JSON.stringify({
            to: targetId,
            messages: msgList
        })
    };
    let response = UrlFetchApp.fetch(url, options);
    return JSON.parse(response.getContentText('UTF-8'));
}

/**
 * LINEに応答メッセージを送信する
 * @param {String} replyToken リプライトークン
 * @param {Object} msgList メッセージリスト
 */
function sendLineReply(replyToken, msgList) {
    let url = 'https://api.line.me/v2/bot/message/reply';
    let options = {
        'method': 'post',
        'headers': {
            'Content-Type': 'application/json; charset=UTF-8',
            'Authorization': `Bearer ${LINE_CHANNEL_TOKEN}`
        },
        'payload': JSON.stringify({
            replyToken: replyToken,
            messages: msgList
        })
    };
    let response = UrlFetchApp.fetch(url, options);
    return JSON.parse(response.getContentText('UTF-8'));
}