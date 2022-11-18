"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EHttpStatusCode = exports.httpStatusCodes = void 0;
exports.httpStatusCodes = {
    [100]: 'Continue',
    [101]: 'Switching protocols',
    [102]: 'Processing',
    [103]: 'Early Hints',
    [200]: 'OK',
    [201]: 'Created',
    [202]: 'Accepted',
    [203]: 'Non-Authoritative Information',
    [204]: 'No Content',
    [205]: 'Reset Content',
    [206]: 'Partial Content',
    [207]: 'Multi-Status',
    [208]: 'Already Reported',
    [226]: 'IM Used',
    [300]: 'Multiple Choices',
    [301]: 'Moved Permanently',
    [302]: 'Found (Previously "Moved Temporarily")',
    [303]: 'See Other',
    [304]: 'Not Modified',
    [305]: 'Use Proxy',
    [306]: 'Switch Proxy',
    [307]: 'Temporary Redirect',
    [308]: 'Permanent Redirect',
    [400]: 'Bad Request',
    [401]: 'Unauthorized',
    [402]: 'Payment Required',
    [403]: 'Forbidden',
    [404]: 'Not Found',
    [405]: 'Method Not Allowed',
    [406]: 'Not Acceptable',
    [407]: 'Proxy Authentication Required',
    [408]: 'Request Timeout',
    [409]: 'Conflict',
    [410]: 'Gone',
    [411]: 'Length Required',
    [412]: 'Precondition Failed',
    [413]: 'Payload Too Large',
    [414]: 'URI Too Long',
    [415]: 'Unsupported Media Type',
    [416]: 'Range Not Satisfiable',
    [417]: 'Expectation Failed',
    [418]: 'I\'m a Teapot',
    [421]: 'Misdirected Request',
    [422]: 'Unprocessable Entity',
    [423]: 'Locked',
    [424]: 'Failed Dependency',
    [425]: 'Too Early',
    [426]: 'Upgrade Required',
    [428]: 'Precondition Required',
    [429]: 'Too Many Requests',
    [431]: 'Request Header Fields Too Large',
    [451]: 'Unavailable For Legal Reasons',
    [500]: 'Internal Server Error',
    [501]: 'Not Implemented',
    [502]: 'Bad Gateway',
    [503]: 'Service Unavailable',
    [504]: 'Gateway Timeout',
    [505]: 'HTTP Version Not Supported',
    [506]: 'Variant Also Negotiates',
    [507]: 'Insufficient Storage',
    [508]: 'Loop Detected',
    [510]: 'Not Extended',
    [511]: 'Network Authentication Required',
};
var EHttpStatusCode;
(function (EHttpStatusCode) {
    EHttpStatusCode[EHttpStatusCode["Continue"] = 100] = "Continue";
    EHttpStatusCode[EHttpStatusCode["SwitchingProtocols"] = 101] = "SwitchingProtocols";
    EHttpStatusCode[EHttpStatusCode["Processing"] = 102] = "Processing";
    EHttpStatusCode[EHttpStatusCode["EarlyHints"] = 103] = "EarlyHints";
    EHttpStatusCode[EHttpStatusCode["OK"] = 200] = "OK";
    EHttpStatusCode[EHttpStatusCode["Created"] = 201] = "Created";
    EHttpStatusCode[EHttpStatusCode["Accepted"] = 202] = "Accepted";
    EHttpStatusCode[EHttpStatusCode["NonAuthoritativeInformation"] = 203] = "NonAuthoritativeInformation";
    EHttpStatusCode[EHttpStatusCode["NoContent"] = 204] = "NoContent";
    EHttpStatusCode[EHttpStatusCode["ResetContent"] = 205] = "ResetContent";
    EHttpStatusCode[EHttpStatusCode["PartialContent"] = 206] = "PartialContent";
    EHttpStatusCode[EHttpStatusCode["MultiStatus"] = 207] = "MultiStatus";
    EHttpStatusCode[EHttpStatusCode["AlreadyReported"] = 208] = "AlreadyReported";
    EHttpStatusCode[EHttpStatusCode["IMUsed"] = 226] = "IMUsed";
    EHttpStatusCode[EHttpStatusCode["MultipleChoices"] = 300] = "MultipleChoices";
    EHttpStatusCode[EHttpStatusCode["MovedPermanently"] = 301] = "MovedPermanently";
    EHttpStatusCode[EHttpStatusCode["Found"] = 302] = "Found";
    EHttpStatusCode[EHttpStatusCode["SeeOther"] = 303] = "SeeOther";
    EHttpStatusCode[EHttpStatusCode["NotModified"] = 304] = "NotModified";
    EHttpStatusCode[EHttpStatusCode["UseProxy"] = 305] = "UseProxy";
    EHttpStatusCode[EHttpStatusCode["SwitchProxy"] = 306] = "SwitchProxy";
    EHttpStatusCode[EHttpStatusCode["TemporaryRedirect"] = 307] = "TemporaryRedirect";
    EHttpStatusCode[EHttpStatusCode["PermanentRedirect"] = 308] = "PermanentRedirect";
    EHttpStatusCode[EHttpStatusCode["BadRequest"] = 400] = "BadRequest";
    EHttpStatusCode[EHttpStatusCode["Unauthorized"] = 401] = "Unauthorized";
    EHttpStatusCode[EHttpStatusCode["PaymentRequired"] = 402] = "PaymentRequired";
    EHttpStatusCode[EHttpStatusCode["Forbidden"] = 403] = "Forbidden";
    EHttpStatusCode[EHttpStatusCode["NotFound"] = 404] = "NotFound";
    EHttpStatusCode[EHttpStatusCode["MethodNotAllowed"] = 405] = "MethodNotAllowed";
    EHttpStatusCode[EHttpStatusCode["NotAcceptable"] = 406] = "NotAcceptable";
    EHttpStatusCode[EHttpStatusCode["ProxyAuthenticationRequired"] = 407] = "ProxyAuthenticationRequired";
    EHttpStatusCode[EHttpStatusCode["RequestTimeout"] = 408] = "RequestTimeout";
    EHttpStatusCode[EHttpStatusCode["Conflict"] = 409] = "Conflict";
    EHttpStatusCode[EHttpStatusCode["Gone"] = 410] = "Gone";
    EHttpStatusCode[EHttpStatusCode["LengthRequired"] = 411] = "LengthRequired";
    EHttpStatusCode[EHttpStatusCode["PreconditionFailed"] = 412] = "PreconditionFailed";
    EHttpStatusCode[EHttpStatusCode["PayloadTooLarge"] = 413] = "PayloadTooLarge";
    EHttpStatusCode[EHttpStatusCode["URITooLong"] = 414] = "URITooLong";
    EHttpStatusCode[EHttpStatusCode["UnsupportedMediaType"] = 415] = "UnsupportedMediaType";
    EHttpStatusCode[EHttpStatusCode["RangeNotSatisfiable"] = 416] = "RangeNotSatisfiable";
    EHttpStatusCode[EHttpStatusCode["ExpectationFailed"] = 417] = "ExpectationFailed";
    EHttpStatusCode[EHttpStatusCode["ImATeapot"] = 418] = "ImATeapot";
    EHttpStatusCode[EHttpStatusCode["MisdirectedRequest"] = 421] = "MisdirectedRequest";
    EHttpStatusCode[EHttpStatusCode["UnprocessableEntity"] = 422] = "UnprocessableEntity";
    EHttpStatusCode[EHttpStatusCode["Locked"] = 423] = "Locked";
    EHttpStatusCode[EHttpStatusCode["FailedDependency"] = 424] = "FailedDependency";
    EHttpStatusCode[EHttpStatusCode["TooEarly"] = 425] = "TooEarly";
    EHttpStatusCode[EHttpStatusCode["UpgradeRequired"] = 426] = "UpgradeRequired";
    EHttpStatusCode[EHttpStatusCode["PreconditionRequired"] = 428] = "PreconditionRequired";
    EHttpStatusCode[EHttpStatusCode["TooManyRequests"] = 429] = "TooManyRequests";
    EHttpStatusCode[EHttpStatusCode["RequestHeaderFieldsTooLarge"] = 431] = "RequestHeaderFieldsTooLarge";
    EHttpStatusCode[EHttpStatusCode["UnavailableForLegalReasons"] = 451] = "UnavailableForLegalReasons";
    EHttpStatusCode[EHttpStatusCode["InternalServerError"] = 500] = "InternalServerError";
    EHttpStatusCode[EHttpStatusCode["NotImplemented"] = 501] = "NotImplemented";
    EHttpStatusCode[EHttpStatusCode["BadGateway"] = 502] = "BadGateway";
    EHttpStatusCode[EHttpStatusCode["ServiceUnavailable"] = 503] = "ServiceUnavailable";
    EHttpStatusCode[EHttpStatusCode["GatewayTimeout"] = 504] = "GatewayTimeout";
    EHttpStatusCode[EHttpStatusCode["HTTPVersionNotSupported"] = 505] = "HTTPVersionNotSupported";
    EHttpStatusCode[EHttpStatusCode["VariantAlsoNegotiates"] = 506] = "VariantAlsoNegotiates";
    EHttpStatusCode[EHttpStatusCode["InsufficientStorage"] = 507] = "InsufficientStorage";
    EHttpStatusCode[EHttpStatusCode["LoopDetected"] = 508] = "LoopDetected";
    EHttpStatusCode[EHttpStatusCode["NotExtended"] = 510] = "NotExtended";
    EHttpStatusCode[EHttpStatusCode["NetworkAuthenticationRequired"] = 511] = "NetworkAuthenticationRequired";
})(EHttpStatusCode = exports.EHttpStatusCode || (exports.EHttpStatusCode = {}));
