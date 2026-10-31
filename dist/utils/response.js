export function sendSuccess(res, data, message = 'Success', statusCode = 200, meta) {
    const requestId = res.locals?.requestId;
    const body = {
        success: true,
        message,
        data,
        ...(meta ? { meta } : {}),
        ...(requestId ? { requestId } : {}),
    };
    return res.status(statusCode).json(body);
}
export function sendPaginated(res, items, total, page, limit, message = 'Success') {
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return sendSuccess(res, items, message, 200, { page, limit, total, totalPages });
}
export default sendSuccess;
//# sourceMappingURL=response.js.map