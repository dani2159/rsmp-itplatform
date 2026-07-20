// ISO Build Job Tracker — untuk track progress build ISO
const jobs = new Map()

function createJob(jobId, label) {
  const job = {
    id: jobId,
    label,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    logFile: `/var/log/rsmp-iso-build-${jobId}.log`,
    pid: null,
  }
  jobs.set(String(jobId), job)
  return job
}

function updateJob(jobId, updates) {
  const job = jobs.get(String(jobId))
  if (job) Object.assign(job, updates)
  return job
}

function getJob(jobId) {
  return jobs.get(String(jobId)) || null
}

function listJobs() {
  return Array.from(jobs.values()).sort((a,b) =>
    new Date(b.startedAt) - new Date(a.startedAt)
  )
}

module.exports = { createJob, updateJob, getJob, listJobs }
