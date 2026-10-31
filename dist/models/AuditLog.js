import mongoose, { Schema } from 'mongoose';
/** Audit trail for important administrative actions. */
const auditLogSchema = new Schema({
    action: { type: String, required: true, index: true },
    entity: { type: String, required: true, index: true },
    entityId: { type: Schema.Types.ObjectId },
    actor: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    actorEmail: { type: String },
    metadata: { type: Schema.Types.Mixed },
    ip: { type: String },
    requestId: { type: String },
}, { timestamps: true });
auditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });
export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
//# sourceMappingURL=AuditLog.js.map