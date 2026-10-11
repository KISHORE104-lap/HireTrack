// lib/samples.js
// Example applications, used by "Load sample data" and the one-click demo account.

const crypto = require('crypto');
const db = require('./db');

// Date n days from today as YYYY-MM-DD
function daysFromToday(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function sampleApplications() {
  return [
    { company: 'Zoho', role: 'Member Technical Staff', location: 'Chennai', status: 'Interview', appliedOn: daysFromToday(-12), interviewOn: daysFromToday(2), notes: 'Round 2: data structures and a small coding task.' },
    { company: 'Infosys', role: 'Systems Engineer', location: 'Mysuru', status: 'Offer', appliedOn: daysFromToday(-30), notes: 'Offer letter received. Joining date to confirm.' },
    { company: 'TCS', role: 'Assistant System Engineer', location: 'Coimbatore', status: 'Applied', appliedOn: daysFromToday(-5) },
    { company: 'Freshworks', role: 'Associate Software Engineer', location: 'Chennai', status: 'Interview', appliedOn: daysFromToday(-9), interviewOn: daysFromToday(5), notes: 'Prepare JavaScript and REST API questions.' },
    { company: 'Wipro', role: 'Project Engineer', location: 'Bengaluru', status: 'Rejected', appliedOn: daysFromToday(-25) },
    { company: 'Accenture', role: 'Associate Software Engineer', location: 'Remote', status: 'Wishlist', notes: 'Applications open next month.' },
    { company: 'Cognizant', role: 'Programmer Analyst Trainee', location: 'Coimbatore', status: 'Applied', appliedOn: daysFromToday(-2) }
  ];
}

// Give a user the sample applications (only if they have none yet)
async function seedForUser(userId) {
  const key = `applications:${userId}`;
  const existing = await db.list(key);
  if (existing.length > 0) return;
  let i = 0;
  for (const sample of sampleApplications()) {
    // createdAt a few seconds apart so "Newest first" keeps a stable order
    const time = new Date(Date.now() - (i++) * 1000).toISOString();
    const app = { id: crypto.randomUUID(), location: '', interviewOn: '', link: '', notes: '', appliedOn: '', ...sample, createdAt: time, updatedAt: time };
    await db.set(key, app.id, app);
  }
}

module.exports = { seedForUser };
