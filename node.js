/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  UNNAMALAI INSTITUTE OF TECHNOLOGY                           ║
 * ║  Smart Attendance Management System — Backend (server.js)    ║
 * ║  Stack: Node.js · Express · MongoDB (Mongoose) · JWT         ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

const express       = require('express');
const mongoose      = require('mongoose');
const bcrypt        = require('bcryptjs');
const jwt           = require('jsonwebtoken');
const cors          = require('cors');
const dotenv        = require('dotenv');
const path          = require('path');

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'uit_smart_att_secret_2025';

// ── Middleware ──────────────────────────────────────────────────
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── MongoDB Connection ──────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/uit_attendance', {
  useNewUrlParser: true, useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB connected'))
  .catch(err => { console.error('❌ MongoDB error:', err.message); });

// ═══════════════════════════════════════════════════════════════
//  SCHEMAS & MODELS
// ═══════════════════════════════════════════════════════════════

// ── Department ──────────────────────────────────────────────────
const DeptSchema = new mongoose.Schema({
  name:        { type: String, required: true, unique: true },
  code:        { type: String, required: true },
  hod:         { type: String },
  totalStudents: { type: Number, default: 0 },
  avgAttendance: { type: Number, default: 0 },
  createdAt:   { type: Date, default: Date.now }
});
const Department = mongoose.model('Department', DeptSchema);

// ── User (Auth) ─────────────────────────────────────────────────
const UserSchema = new mongoose.Schema({
  userId:   { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role:     { type: String, enum: ['admin','staff','student','parent'], required: true },
  name:     { type: String },
  email:    { type: String },
  phone:    { type: String },
  isActive: { type: Boolean, default: true },
  lastLogin:{ type: Date },
  createdAt:{ type: Date, default: Date.now }
});
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});
const User = mongoose.model('User', UserSchema);

// ── Student ─────────────────────────────────────────────────────
const StudentSchema = new mongoose.Schema({
  regNo:      { type: String, required: true, unique: true },
  name:       { type: String, required: true },
  email:      { type: String },
  phone:      { type: String },
  parentPhone:{ type: String },
  department: { type: String, required: true },
  year:       { type: Number, required: true },
  section:    { type: String, default: 'A' },
  rollNo:     { type: Number },
  dob:        { type: Date },
  bloodGroup: { type: String },
  address:    { type: String },
  photo:      { type: String },
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive:   { type: Boolean, default: true },
  createdAt:  { type: Date, default: Date.now }
});
const Student = mongoose.model('Student', StudentSchema);

// ── Staff ───────────────────────────────────────────────────────
const StaffSchema = new mongoose.Schema({
  staffCode:   { type: String, required: true, unique: true },
  name:        { type: String, required: true },
  email:       { type: String },
  phone:       { type: String },
  department:  { type: String },
  designation: { type: String },
  subjects:    [{ type: String }],
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive:    { type: Boolean, default: true },
  createdAt:   { type: Date, default: Date.now }
});
const Staff = mongoose.model('Staff', StaffSchema);

// ── Attendance ──────────────────────────────────────────────────
const AttendanceSchema = new mongoose.Schema({
  student:    { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  regNo:      { type: String },
  date:       { type: Date, required: true },
  period:     { type: Number, min: 1, max: 8 },
  subject:    { type: String },
  department: { type: String },
  year:       { type: Number },
  section:    { type: String },
  status:     { type: String, enum: ['Present','Absent','Leave','Late','Half-Day'], required: true },
  markedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  method:     { type: String, enum: ['Manual','QR','Face','System'], default: 'Manual' },
  location:   { lat: Number, lng: Number },
  remark:     { type: String },
  createdAt:  { type: Date, default: Date.now }
});
AttendanceSchema.index({ student: 1, date: 1, period: 1 }, { unique: true });
const Attendance = mongoose.model('Attendance', AttendanceSchema);

// ── Leave Request ───────────────────────────────────────────────
const LeaveSchema = new mongoose.Schema({
  student:     { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  regNo:       { type: String },
  type:        { type: String, enum: ['Medical','Personal','OD','Family','Emergency','Other'] },
  fromDate:    { type: Date, required: true },
  toDate:      { type: Date, required: true },
  days:        { type: Number },
  reason:      { type: String },
  document:    { type: String },
  status:      { type: String, enum: ['Pending','Approved','Rejected'], default: 'Pending' },
  approvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  remark:      { type: String },
  appliedAt:   { type: Date, default: Date.now },
  reviewedAt:  { type: Date }
});
const LeaveRequest = mongoose.model('LeaveRequest', LeaveSchema);

// ── Notification ────────────────────────────────────────────────
const NotifSchema = new mongoose.Schema({
  to:       { type: String },  // 'all' | userId
  role:     { type: String },
  title:    { type: String, required: true },
  body:     { type: String, required: true },
  type:     { type: String, enum: ['alert','info','warning','success'], default: 'info' },
  read:     { type: Boolean, default: false },
  channel:  { type: String, enum: ['in-app','whatsapp','email','sms'], default: 'in-app' },
  createdAt:{ type: Date, default: Date.now }
});
const Notification = mongoose.model('Notification', NotifSchema);

// ── Daily Class Log ─────────────────────────────────────────────
const ClassLogSchema = new mongoose.Schema({
  staff:       { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  department:  { type: String },
  year:        { type: Number },
  section:     { type: String },
  subject:     { type: String },
  period:      { type: Number },
  date:        { type: Date, default: Date.now },
  topic:       { type: String, required: true },
  difficulty:  { type: String, enum: ['Easy','Medium','Hard'], default: 'Medium' },
  feedback:    { type: String },
  studentsPresent: { type: Number },
  totalStrength:   { type: Number },
  notes:       { type: String },
  createdAt:   { type: Date, default: Date.now }
});
const ClassLog = mongoose.model('ClassLog', ClassLogSchema);

// ── Timetable ───────────────────────────────────────────────────
const TimetableSchema = new mongoose.Schema({
  department:  { type: String, required: true },
  year:        { type: Number, required: true },
  section:     { type: String, default: 'A' },
  day:         { type: String, enum: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'] },
  period:      { type: Number, min: 1, max: 8 },
  subject:     { type: String },
  staff:       { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  startTime:   { type: String },
  endTime:     { type: String },
  roomNo:      { type: String },
  createdAt:   { type: Date, default: Date.now }
});
const Timetable = mongoose.model('Timetable', TimetableSchema);

// ═══════════════════════════════════════════════════════════════
//  MIDDLEWARE
// ═══════════════════════════════════════════════════════════════
function auth(req, res, next) {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Access denied. No token.' });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function role(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role))
      return res.status(403).json({ error: 'Access denied for your role.' });
    next();
  };
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// ═══════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════════════════════════════
const authRouter = express.Router();

// POST /api/auth/login
authRouter.post('/login', asyncHandler(async (req, res) => {
  const { userId, password, role: loginRole } = req.body;
  const user = await User.findOne({ userId, role: loginRole });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
  await User.updateOne({ _id: user._id }, { lastLogin: new Date() });
  const token = jwt.sign(
    { id: user._id, userId: user.userId, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.json({ token, role: user.role, name: user.name, userId: user.userId });
}));

// POST /api/auth/refresh
authRouter.post('/refresh', auth, asyncHandler(async (req, res) => {
  const token = jwt.sign(
    { id: req.user.id, userId: req.user.userId, role: req.user.role, name: req.user.name },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.json({ token });
}));

app.use('/api/auth', authRouter);

// ═══════════════════════════════════════════════════════════════
//  ATTENDANCE ROUTES
// ═══════════════════════════════════════════════════════════════
const attRouter = express.Router();

// POST /api/attendance/mark  (staff / admin)
attRouter.post('/mark', auth, role('staff','admin'), asyncHandler(async (req, res) => {
  const { records, date, period, subject, department, year, section, method } = req.body;
  if (!Array.isArray(records)) return res.status(400).json({ error: 'records array required' });
  const results = [];
  for (const r of records) {
    const student = await Student.findOne({ regNo: r.regNo });
    if (!student) continue;
    await Attendance.findOneAndUpdate(
      { student: student._id, date: new Date(date), period },
      {
        student: student._id,
        regNo: r.regNo,
        date: new Date(date),
        period,
        subject,
        department: department || student.department,
        year: year || student.year,
        section: section || student.section,
        status: r.status,
        method: method || 'Manual',
        markedBy: req.user.id,
        remark: r.remark || ''
      },
      { upsert: true, new: true }
    );
    results.push(r.regNo);
    // Auto-notify if absent
    if (r.status === 'Absent') {
      await Notification.create({
        to: student.regNo,
        role: 'student',
        title: '📵 Absence Recorded',
        body: `You were marked Absent for Period ${period} (${subject}) on ${date}. Please inform your staff if this is incorrect.`,
        type: 'warning'
      });
    }
  }
  res.json({ success: true, marked: results.length });
}));

// POST /api/attendance/bulk  (mark entire class)
attRouter.post('/bulk', auth, role('staff','admin'), asyncHandler(async (req, res) => {
  const { department, year, section, date, period, subject, defaultStatus } = req.body;
  const students = await Student.find({ department, year, section, isActive: true });
  const ops = students.map(s => ({
    updateOne: {
      filter: { student: s._id, date: new Date(date), period },
      update: {
        $set: {
          student: s._id,
          regNo: s.regNo,
          date: new Date(date),
          period,
          subject,
          department,
          year,
          section,
          status: defaultStatus || 'Present',
          markedBy: req.user.id,
          method: 'Manual'
        }
      },
      upsert: true
    }
  }));
  if (ops.length) await Attendance.bulkWrite(ops);
  res.json({ success: true, count: students.length });
}));

// GET /api/attendance/student/:regNo  (student sees own)
attRouter.get('/student/:regNo', auth, asyncHandler(async (req, res) => {
  const { regNo } = req.params;
  const { from, to } = req.query;
  const filter = { regNo };
  if (from && to) filter.date = { $gte: new Date(from), $lte: new Date(to) };
  const records = await Attendance.find(filter).sort({ date: -1 }).limit(200);
  // Summary
  const total = records.length;
  const present = records.filter(r => r.status === 'Present' || r.status === 'Late').length;
  const absent  = records.filter(r => r.status === 'Absent').length;
  const leave   = records.filter(r => r.status === 'Leave').length;
  const pct     = total > 0 ? ((present / total) * 100).toFixed(2) : '0.00';
  res.json({ records, summary: { total, present, absent, leave, pct: parseFloat(pct) } });
}));

// GET /api/attendance/class  (staff views class)
attRouter.get('/class', auth, role('staff','admin'), asyncHandler(async (req, res) => {
  const { department, year, section, date, period } = req.query;
  const filter = {};
  if (department) filter.department = department;
  if (year) filter.year = parseInt(year);
  if (section) filter.section = section;
  if (date) filter.date = new Date(date);
  if (period) filter.period = parseInt(period);
  const records = await Attendance.find(filter).sort({ date: -1 });
  res.json(records);
}));

// GET /api/attendance/summary/dept  (admin analytics)
attRouter.get('/summary/dept', auth, role('admin'), asyncHandler(async (req, res) => {
  const pipeline = [
    { $group: {
      _id: '$department',
      total:   { $sum: 1 },
      present: { $sum: { $cond: [{ $in: ['$status', ['Present','Late']] }, 1, 0] } }
    }},
    { $project: {
      department: '$_id',
      total: 1,
      present: 1,
      pct: { $multiply: [{ $divide: ['$present','$total'] }, 100] }
    }}
  ];
  const data = await Attendance.aggregate(pipeline);
  res.json(data);
}));

// GET /api/attendance/risk  (admin: students below threshold)
attRouter.get('/risk', auth, role('admin','staff'), asyncHandler(async (req, res) => {
  const threshold = parseFloat(req.query.threshold || 80);
  const pipeline = [
    { $group: {
      _id: '$regNo',
      total:   { $sum: 1 },
      present: { $sum: { $cond: [{ $in: ['$status', ['Present','Late']] }, 1, 0] } }
    }},
    { $project: {
      regNo: '$_id',
      pct: { $multiply: [{ $divide: ['$present','$total'] }, 100] }
    }},
    { $match: { pct: { $lt: threshold } } },
    { $sort: { pct: 1 } }
  ];
  const risky = await Attendance.aggregate(pipeline);
  // Enrich with student details
  const populated = await Promise.all(risky.slice(0, 50).map(async r => {
    const s = await Student.findOne({ regNo: r.regNo });
    return { ...r, student: s };
  }));
  res.json(populated);
}));

app.use('/api/attendance', attRouter);

// ═══════════════════════════════════════════════════════════════
//  LEAVE ROUTES
// ═══════════════════════════════════════════════════════════════
const leaveRouter = express.Router();

// POST /api/leave/apply
leaveRouter.post('/apply', auth, role('student'), asyncHandler(async (req, res) => {
  const { type, fromDate, toDate, reason } = req.body;
  const student = await Student.findOne({ regNo: req.user.userId });
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const days = Math.ceil((new Date(toDate) - new Date(fromDate)) / 86400000) + 1;
  const leave = await LeaveRequest.create({
    student: student._id,
    regNo: req.user.userId,
    type, fromDate, toDate, days, reason
  });
  await Notification.create({
    to: 'staff',
    role: 'staff',
    title: '📋 New Leave Request',
    body: `${student.name} (${student.regNo}) applied for ${type} leave from ${fromDate} to ${toDate}.`,
    type: 'info'
  });
  res.json({ success: true, leave });
}));

// GET /api/leave/pending  (staff)
leaveRouter.get('/pending', auth, role('staff','admin'), asyncHandler(async (req, res) => {
  const filter = { status: 'Pending' };
  if (req.query.department) {
    const regNos = (await Student.find({ department: req.query.department })).map(s => s.regNo);
    filter.regNo = { $in: regNos };
  }
  const leaves = await LeaveRequest.find(filter)
    .populate('student', 'name regNo department year section')
    .sort({ appliedAt: -1 });
  res.json(leaves);
}));

// PUT /api/leave/:id/review  (staff approves/rejects)
leaveRouter.put('/:id/review', auth, role('staff','admin'), asyncHandler(async (req, res) => {
  const { status, remark } = req.body;
  const leave = await LeaveRequest.findByIdAndUpdate(
    req.params.id,
    { status, remark, approvedBy: req.user.id, reviewedAt: new Date() },
    { new: true }
  ).populate('student');
  if (!leave) return res.status(404).json({ error: 'Leave not found' });
  // If approved, mark attendance as Leave for those days
  if (status === 'Approved') {
    const student = leave.student;
    let d = new Date(leave.fromDate);
    while (d <= new Date(leave.toDate)) {
      for (let p = 1; p <= 5; p++) {
        await Attendance.findOneAndUpdate(
          { regNo: leave.regNo, date: new Date(d), period: p },
          { $set: { status: 'Leave', remark: leave.type, method: 'System' } },
          { upsert: true }
        );
      }
      d.setDate(d.getDate() + 1);
    }
    await Notification.create({
      to: leave.regNo,
      role: 'student',
      title: `✅ Leave ${status}`,
      body: `Your ${leave.type} leave from ${leave.fromDate.toDateString()} to ${leave.toDate.toDateString()} has been ${status.toLowerCase()}. Remark: ${remark || '—'}`,
      type: status === 'Approved' ? 'success' : 'warning'
    });
  }
  res.json({ success: true, leave });
}));

// GET /api/leave/student/:regNo  (student sees own)
leaveRouter.get('/student/:regNo', auth, asyncHandler(async (req, res) => {
  const leaves = await LeaveRequest.find({ regNo: req.params.regNo }).sort({ appliedAt: -1 });
  res.json(leaves);
}));

app.use('/api/leave', leaveRouter);

// ═══════════════════════════════════════════════════════════════
//  STUDENT ROUTES
// ═══════════════════════════════════════════════════════════════
const studentRouter = express.Router();

studentRouter.get('/', auth, role('admin','staff'), asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.department) filter.department = req.query.department;
  if (req.query.year) filter.year = parseInt(req.query.year);
  if (req.query.section) filter.section = req.query.section;
  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { regNo: { $regex: req.query.search, $options: 'i' } }
    ];
  }
  const students = await Student.find(filter).limit(200).sort({ name: 1 });
  res.json(students);
}));

studentRouter.get('/:regNo', auth, asyncHandler(async (req, res) => {
  const student = await Student.findOne({ regNo: req.params.regNo });
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json(student);
}));

studentRouter.post('/', auth, role('admin'), asyncHandler(async (req, res) => {
  const { regNo, name, department, year, section, phone, parentPhone } = req.body;
  const student = await Student.create({ regNo, name, department, year, section, phone, parentPhone });
  // Create user account
  await User.create({ userId: regNo, password: regNo+'@uit', role: 'student', name });
  res.json({ success: true, student });
}));

studentRouter.put('/:id', auth, role('admin'), asyncHandler(async (req, res) => {
  const student = await Student.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(student);
}));

studentRouter.delete('/:id', auth, role('admin'), asyncHandler(async (req, res) => {
  await Student.findByIdAndUpdate(req.params.id, { isActive: false });
  res.json({ success: true });
}));

app.use('/api/students', studentRouter);

// ═══════════════════════════════════════════════════════════════
//  STAFF ROUTES
// ═══════════════════════════════════════════════════════════════
const staffRouter = express.Router();

staffRouter.get('/', auth, role('admin'), asyncHandler(async (req, res) => {
  const staff = await Staff.find({ isActive: true }).sort({ name: 1 });
  res.json(staff);
}));

staffRouter.post('/', auth, role('admin'), asyncHandler(async (req, res) => {
  const { staffCode, name, department, designation, subjects, phone } = req.body;
  const staff = await Staff.create({ staffCode, name, department, designation, subjects, phone });
  await User.create({ userId: staffCode, password: staffCode+'@uit', role: 'staff', name });
  res.json({ success: true, staff });
}));

app.use('/api/staff', staffRouter);

// ═══════════════════════════════════════════════════════════════
//  AI / ANALYTICS ROUTES
// ═══════════════════════════════════════════════════════════════
const aiRouter = express.Router();

// GET /api/ai/bunk-analyzer/:regNo
aiRouter.get('/bunk-analyzer/:regNo', auth, asyncHandler(async (req, res) => {
  const pipeline = [
    { $match: { regNo: req.params.regNo } },
    { $group: {
      _id: null,
      total:   { $sum: 1 },
      present: { $sum: { $cond: [{ $in: ['$status', ['Present','Late']] }, 1, 0] } }
    }}
  ];
  const [data] = await Attendance.aggregate(pipeline);
  if (!data) return res.json({ pct: 0, safe: false });
  const { total, present } = data;
  const currentPct  = (present / total) * 100;
  const afterBunk   = (present / (total + 1)) * 100;
  const afterAttend = ((present + 1) / (total + 1)) * 100;
  const daysNeededFor80 = currentPct >= 80 ? 0 : Math.ceil((0.8 * total - present) / 0.2);
  res.json({
    currentPct: parseFloat(currentPct.toFixed(2)),
    afterBunk: parseFloat(afterBunk.toFixed(2)),
    afterAttend: parseFloat(afterAttend.toFixed(2)),
    safe: afterBunk >= 80,
    daysNeededFor80,
    totalClasses: total,
    attended: present
  });
}));

// GET /api/ai/predict/:regNo
aiRouter.get('/predict/:regNo', auth, asyncHandler(async (req, res) => {
  const regNo = req.params.regNo;
  const records = await Attendance.find({ regNo }).sort({ date: 1 });
  const total = records.length;
  const present = records.filter(r => ['Present','Late'].includes(r.status)).length;
  const currentPct = total > 0 ? (present / total) * 100 : 0;
  // Predict over next 30, 60, 90 days (assuming 5 classes/day)
  const remainingDays = [30, 60, 90];
  const predictions = remainingDays.map(d => {
    const futureClasses = d * 5;
    const projectedPresent = present + (d * 5 * 0.8);  // assume 80% future
    const projectedTotal   = total + futureClasses;
    return {
      days: d,
      projected: parseFloat(((projectedPresent / projectedTotal) * 100).toFixed(2))
    };
  });
  // Day-wise pattern (which days most absent)
  const dayAbsences = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
  records.filter(r => r.status === 'Absent').forEach(r => {
    dayAbsences[new Date(r.date).getDay()]++;
  });
  res.json({ currentPct, predictions, dayAbsences, riskLevel: currentPct < 75 ? 'High' : currentPct < 80 ? 'Medium' : 'Low' });
}));

// GET /api/ai/root-cause/:department
aiRouter.get('/root-cause/:department', auth, role('admin','staff'), asyncHandler(async (req, res) => {
  const pipeline = [
    { $match: { department: req.params.department, status: 'Absent' } },
    { $group: {
      _id: { $dayOfWeek: '$date' },
      count: { $sum: 1 }
    }},
    { $sort: { count: -1 } }
  ];
  const byDay = await Attendance.aggregate(pipeline);
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const bySubject = await Attendance.aggregate([
    { $match: { department: req.params.department, status: 'Absent', subject: { $ne: null } } },
    { $group: { _id: '$subject', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 }
  ]);
  res.json({
    byDay: byDay.map(d => ({ day: days[d._id - 1], count: d.count })),
    bySubject: bySubject.map(s => ({ subject: s._id, count: s.count }))
  });
}));

// GET /api/ai/digital-twin/:regNo
aiRouter.get('/digital-twin/:regNo', auth, asyncHandler(async (req, res) => {
  const pipeline = [
    { $match: { regNo: req.params.regNo } },
    { $group: { _id: null, total: { $sum: 1 }, present: { $sum: { $cond: [{ $in: ['$status', ['Present','Late']] }, 1, 0] } } } }
  ];
  const [data] = await Attendance.aggregate(pipeline);
  const { total = 0, present = 0 } = data || {};
  const remaining = 90;
  const scenarios = {
    regular: parseFloat(((present + remaining) / (total + remaining) * 100).toFixed(2)),
    bunk:    parseFloat(((present + remaining * 0.4) / (total + remaining) * 100).toFixed(2)),
    smart:   parseFloat(((present + remaining * 0.82) / (total + remaining) * 100).toFixed(2)),
  };
  res.json({ scenarios, current: total > 0 ? parseFloat((present/total*100).toFixed(2)) : 0 });
}));

// GET /api/ai/discipline-score/:regNo
aiRouter.get('/discipline-score/:regNo', auth, asyncHandler(async (req, res) => {
  const records = await Attendance.find({ regNo: req.params.regNo });
  const total   = records.length;
  const present = records.filter(r => ['Present','Late'].includes(r.status)).length;
  const lates   = records.filter(r => r.status === 'Late').length;
  const leaves  = await LeaveRequest.countDocuments({ regNo: req.params.regNo });
  const consistency = total > 0 ? (present / total * 100) : 0;
  const punctuality  = total > 0 ? ((present - lates) / present * 100) : 100;
  const leaveFreq    = Math.max(0, 100 - leaves * 5);
  const score = Math.round((consistency * 0.5 + punctuality * 0.3 + leaveFreq * 0.2));
  const label = score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 60 ? 'Fair' : 'Poor';
  res.json({ score, label, consistency: parseFloat(consistency.toFixed(1)), punctuality: parseFloat(punctuality.toFixed(1)), leaveFreq });
}));

app.use('/api/ai', aiRouter);

// ═══════════════════════════════════════════════════════════════
//  NOTIFICATION ROUTES
// ═══════════════════════════════════════════════════════════════
const notifRouter = express.Router();

notifRouter.get('/', auth, asyncHandler(async (req, res) => {
  const filter = { $or: [{ to: req.user.userId }, { to: req.user.role }, { to: 'all' }] };
  const notifs = await Notification.find(filter).sort({ createdAt: -1 }).limit(30);
  res.json(notifs);
}));

notifRouter.post('/broadcast', auth, role('admin'), asyncHandler(async (req, res) => {
  const { to, role: notifRole, title, body, type } = req.body;
  const notif = await Notification.create({ to, role: notifRole, title, body, type });
  res.json({ success: true, notif });
}));

notifRouter.put('/:id/read', auth, asyncHandler(async (req, res) => {
  await Notification.findByIdAndUpdate(req.params.id, { read: true });
  res.json({ success: true });
}));

// Auto-alert: trigger for all students below threshold
notifRouter.post('/alert-risk', auth, role('admin'), asyncHandler(async (req, res) => {
  const threshold = req.body.threshold || 80;
  const pipeline = [
    { $group: { _id: '$regNo', total: { $sum: 1 }, present: { $sum: { $cond: [{ $in: ['$status', ['Present','Late']] }, 1, 0] } } } },
    { $project: { regNo: '$_id', pct: { $multiply: [{ $divide: ['$present','$total'] }, 100] } } },
    { $match: { pct: { $lt: threshold } } }
  ];
  const risky = await Attendance.aggregate(pipeline);
  let count = 0;
  for (const r of risky) {
    await Notification.create({
      to: r.regNo,
      title: '⚠️ Low Attendance Warning',
      body: `Your current attendance is ${r.pct.toFixed(1)}%, below the required ${threshold}%. Please attend classes regularly.`,
      type: 'alert'
    });
    count++;
  }
  res.json({ success: true, notified: count });
}));

app.use('/api/notifications', notifRouter);

// ═══════════════════════════════════════════════════════════════
//  CLASS LOG ROUTES
// ═══════════════════════════════════════════════════════════════
const logRouter = express.Router();

logRouter.post('/', auth, role('staff','admin'), asyncHandler(async (req, res) => {
  const log = await ClassLog.create({ ...req.body, staff: req.user.id });
  res.json({ success: true, log });
}));

logRouter.get('/', auth, asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.department) filter.department = req.query.department;
  if (req.query.date) filter.date = new Date(req.query.date);
  const logs = await ClassLog.find(filter).populate('staff','name').sort({ date: -1 }).limit(50);
  res.json(logs);
}));

app.use('/api/logs', logRouter);

// ═══════════════════════════════════════════════════════════════
//  TIMETABLE ROUTES
// ═══════════════════════════════════════════════════════════════
const ttRouter = express.Router();

ttRouter.get('/', auth, asyncHandler(async (req, res) => {
  const { department, year, section } = req.query;
  const filter = {};
  if (department) filter.department = department;
  if (year) filter.year = parseInt(year);
  if (section) filter.section = section;
  const tt = await Timetable.find(filter).populate('staff','name');
  res.json(tt);
}));

ttRouter.post('/', auth, role('admin'), asyncHandler(async (req, res) => {
  const entry = await Timetable.create(req.body);
  res.json({ success: true, entry });
}));

app.use('/api/timetable', ttRouter);

// ═══════════════════════════════════════════════════════════════
//  DEPARTMENT ROUTES
// ═══════════════════════════════════════════════════════════════
app.get('/api/departments', auth, asyncHandler(async (req, res) => {
  const depts = await Department.find();
  res.json(depts);
}));

// ═══════════════════════════════════════════════════════════════
//  SEED DATA ROUTE (run once)
// ═══════════════════════════════════════════════════════════════
app.post('/api/seed', asyncHandler(async (req, res) => {
  const existingAdmin = await User.findOne({ userId: 'ADMIN001' });
  if (existingAdmin) return res.json({ message: 'Already seeded' });

  // Departments
  const DEPTS_LIST = [
    { name: 'CSE', code: 'CS', hod: 'Dr. K. Murugan' },
    { name: 'ECE', code: 'EC', hod: 'Dr. R. Lakshmi' },
    { name: 'EEE', code: 'EE', hod: 'Prof. S. Selvam' },
    { name: 'MECH', code: 'ME', hod: 'Dr. V. Rajan' },
    { name: 'AIDS', code: 'AI', hod: 'Prof. P. Nair' },
    { name: 'Cyber Security', code: 'CY', hod: 'Dr. A. Balamurugan' },
  ];
  await Department.insertMany(DEPTS_LIST.map(d => ({ ...d, totalStudents: 250 + Math.floor(Math.random()*50) })));

  // Admin user
  await User.create({ userId: 'ADMIN001', password: 'admin@123', role: 'admin', name: 'Dr. K. Murugan' });

  // Staff
  const staffNames = [
    'Prof. S. Anand','Dr. M. Priya','Prof. R. Kumar','Dr. T. Selvam','Prof. K. Meena',
    'Dr. B. Rajan','Prof. A. Devi','Dr. P. Suresh','Prof. L. Nair','Dr. C. Reddy',
    'Prof. G. Thomas','Dr. H. Singh','Prof. J. Patel','Dr. K. Rao','Prof. M. Sharma',
    'Dr. N. Iyer','Prof. O. Pillai','Dr. Q. Srinivasan','Prof. R. Bose','Dr. S. Nanda',
    'Prof. T. Murthy','Dr. U. Krishnamurthy','Prof. V. Chandran','Dr. W. Parekh','Prof. X. Joshi',
    'Dr. Y. Goswami','Prof. Z. Agarwal','Dr. AA. Venkat','Prof. BB. Ghosh','Dr. CC. Bhatt'
  ];
  for (let i = 0; i < 30; i++) {
    const code = `STF${String(i+1).padStart(3,'0')}`;
    const dept = DEPTS_LIST[i % 6].name;
    await Staff.create({
      staffCode: code,
      name: staffNames[i],
      department: dept,
      designation: i < 10 ? 'Professor' : i < 20 ? 'Associate Professor' : 'Assistant Professor',
      subjects: ['Subject ' + (i+1), 'Subject ' + (i+2)],
    });
    await User.create({ userId: code, password: 'staff@123', role: 'staff', name: staffNames[i] });
  }

  // Students (1000+)
  const FIRST = ['Aarav','Priya','Karthik','Ananya','Vikram','Meena','Rajan','Deepa','Suresh','Lakshmi',
    'Arun','Sona','Manoj','Revathi','Harish','Shanthi','Balaji','Kavitha','Pradeep','Swathi',
    'Gopal','Arthi','Vijay','Pooja','Sathish','Nirmala','Ramesh','Saranya','Dinesh','Uma',
    'Rajesh','Kavya','Mohan','Divya','Santosh','Malar','Hari','Sudha','Ganesh','Rekha'];
  const LAST = ['Kumar','Sharma','Raj','Reddy','Singh','Selvi','Murugan','Nair','Babu','Devi',
    'Patel','Thomas','Krishnan','Arumugam','Pandey','Rani','Iyer','Perumal','Nayak','Pillai'];

  let studentCount = 0;
  for (const d of DEPTS_LIST) {
    for (let yr = 1; yr <= 4; yr++) {
      for (let sec of ['A','B']) {
        for (let i = 0; i < 32; i++) {
          const firstName = FIRST[Math.floor(Math.random() * FIRST.length)];
          const lastName  = LAST[Math.floor(Math.random() * LAST.length)];
          const name      = firstName + ' ' + lastName;
          const regNo     = `UIT${String(2021 + yr - 1).slice(2)}${d.code}${String(studentCount + 1000).slice(1)}`;
          try {
            await Student.create({
              regNo, name, department: d.name, year: yr, section: sec,
              phone: `9${Math.floor(Math.random()*900000000+100000000)}`,
              parentPhone: `8${Math.floor(Math.random()*900000000+100000000)}`,
            });
            await User.create({ userId: regNo, password: regNo + '@uit', role: 'student', name });
          } catch(e) { /* ignore duplicates */ }
          studentCount++;
        }
      }
    }
  }

  // Sample parent user
  await User.create({ userId: 'PAR001', password: 'parent@123', role: 'parent', name: 'Mrs. R. Sharma' });

  res.json({ message: 'Seeded successfully!', students: studentCount, staff: 30, depts: 6 });
}));

// ═══════════════════════════════════════════════════════════════
//  HEALTH CHECK & STATIC
// ═══════════════════════════════════════════════════════════════
app.get('/api/health', (req, res) => res.json({ status: 'OK', time: new Date().toISOString() }));

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
}

// ═══════════════════════════════════════════════════════════════
//  ERROR HANDLER
// ═══════════════════════════════════════════════════════════════
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║  🎓 UIT Smart Attendance System                      ║
║  🚀 Server running on http://localhost:${PORT}          ║
║  📡 API Base: http://localhost:${PORT}/api              ║
║  🌱 Seed data: POST /api/seed                        ║
╚══════════════════════════════════════════════════════╝`);
});

module.exports = app;