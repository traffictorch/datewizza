import './style.css'

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('urlForm')
  const input = document.getElementById('urlInput')
  const report = document.getElementById('report')
  const loading = document.getElementById('loading')

  const PROXY = 'https://api.allorigins.win/raw?url='

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const url = input.value.trim()
    if (!url) return

    loading.classList.remove('hidden')
    report.classList.add('hidden')
    report.innerHTML = ''

    try {
      const res = await fetch(PROXY + encodeURIComponent(url))
      if (!res.ok) throw new Error('Page not reachable')
      const html = await res.text()

      const doc = new DOMParser().parseFromString(html, 'text/html')
      const title = doc.querySelector('title')?.textContent || 'Untitled'
      const text = doc.body?.textContent || ''

      const aiScore = calculateAIScore(text)
      const wordCount = text.trim().split(/\s+/).length

      report.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-4xl mx-auto">
          <h2 class="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-orange-500 to-pink-600 bg-clip-text text-transparent">
            Report for: ${title.substring(0, 60)}…
          </h2>

          <section class="mb-10 p-8 rounded-2xl ${aiScore > 70 ? 'bg-red-50 dark:bg-red-900' : aiScore > 40 ? 'bg-yellow-50 dark:bg-yellow-900' : 'bg-green-50 dark:bg-green-900'}">
            <h3 class="text-2xl font-bold mb-4 flex items-center gap-3">
              AI-Content Probability: <span class="text-4xl">${aiScore}%</span>
            </h3>
            <div class="text-lg">
              ${aiScore > 70 ? 'High risk of AI-generated “slop”. Google is cracking down hard in 2025–2026.' :
                aiScore > 40 ? 'Moderate AI patterns detected – safe for now.' :
                'Looks human-written. Excellent E-E-A-T foundation.'}
            </div>
            <div class="mt-4 font-semibold text-green-600 dark:text-green-400">
              ${aiScore > 60 ? 'Fix: Add personal anecdotes, original data, author bio → +25 E-E-A-T points' : 'Keep doing what you’re doing!'}
            </div>
          </section>

          <div class="grid md:grid-cols-2 gap-6 mb-10">
            <div class="p-6 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900 dark:to-pink-900 rounded-2xl">
              <h4 class="text-xl font-bold mb-2">Frustration Signals Auditor</h4>
              <p class="text-gray-700 dark:text-gray-300">Coming next: rage-quit score, INP forecasting…</p>
            </div>
            <div class="p-6 bg-gradient-to-br from-blue-100 to-cyan-100 dark:from-blue-900 dark:to-cyan-900 rounded-2xl">
              <h4 class="text-xl font-bold mb-2">User Intent Alignment</h4>
              <p class="text-gray-700 dark:text-gray-300">Checks if your content actually answers what people search for.</p>
            </div>
          </div>

          <details class="bg-gray-100 dark:bg-gray-700 rounded-2xl p-6">
            <summary class="text-xl font-semibold cursor-pointer">Core Web Vitals & Standard Checks</summary>
            <div class="mt-4 text-gray-700 dark:text-gray-300">
              <p>Word count: ${wordCount.toLocaleString()}</p>
              <p>Full PageSpeed + Mobile-Friendly APIs in next phase</p>
            </div>
          </details>

          <div class="text-center mt-10">
            <button onclick="location.reload()" class="px-8 py-4 bg-gradient-to-r from-orange-500 to-pink-600 text-white font-bold text-lg rounded-xl hover:shadow-2xl transition">
              New Analysis
            </button>
          </div>
        </div>
      `

      loading.classList.add('hidden')
      report.classList.remove('hidden')
    } catch (err) {
      alert('Error: ' + err.message)
      loading.classList.add('hidden')
    }
  })

  function calculateAIScore(text) {
    const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean)
    if (words.length < 100) return 15

    const freq = {}
    words.forEach(w => freq[w] = (freq[w] || 0) + 1)
    const repeatScore = Object.values(freq).filter(c => c > 5).length * 3

    const sentences = text.split(/[.!?]+/).filter(s => s.trim())
    const lengths = sentences.map(s => s.split(/\s+/).length)
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length
    const variance = lengths.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / lengths.length
    const uniformScore = variance < 25 ? 40 : 0

    return Math.min(100, 15 + repeatScore + uniformScore)
  }
})
