// Discern AI Backend - Constrained & Phase-Controlled
// Task 1: AI strictly classificatory (no interpretation)
// Task 2: Question count governs cognitive arc
// Run with: node discern-backend.js

const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = 3000;

// IMPORTANT: Add your Claude API key here
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'YOUR_API_KEY_HERE';

const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

app.use(cors({
  origin: '*',
  credentials: false
}));
app.use(express.json());

// Session memory - stores cumulative context
const sessions = new Map();

// Pre-defined moments
const MOMENTS = {
  1: {
    title: "Having a difficult conversation",
    framing: "This moment is about thinking clearly before you say something that matters. These conversations rarely feel easy. Often the instinct is to rehearse lines or try to fix the other person, when what may work best is getting yourself into the right state so the conversation has a chance to go well."
  },
  2: {
    title: "When everything feels urgent",
    framing: "This moment is about restoring perspective when everything feels important and time feels compressed. The pressure is real. Often the instinct is to do more faster, when what may work best is deciding what actually deserves your attention right now."
  },
  3: {
    title: "I need to say no to someone",
    framing: "This moment is about setting a boundary without damaging the relationship. Saying no often feels harder than it should. Often the instinct is to be harsh or over-explain, when what may work best is getting clear on what's fair."
  },
  4: {
    title: "Someone's upset with me",
    framing: "This moment is about responding to someone's upset without becoming defensive or dismissive. It can feel uncomfortable when someone's angry with you. Often the instinct is to prove you're right or fix their feelings, when what may work best is getting clear enough to show up well."
  },
  5: {
    title: "I made a mistake",
    framing: "This moment is about owning a mistake clearly without spiralling into shame or defensiveness. Mistakes rarely feel easy to face. Often the instinct is to hide or over-apologise, when what may work best is getting clear on what happened so you can repair it well."
  }
};

// Question bank organized by thinking need
const QUESTION_BANK = {
  grounding: [
    "What specifically is happening in this situation?",
    "What are the facts of the situation — separate from your interpretation?",
    "What is within your control right now?",
    "What outcome actually matters most here?"
  ],
  perspective: [
    "What might the other person be experiencing in this situation?",
    "What assumptions could you be making about their intent?",
    "How might this look from their perspective?",
    "What might you be missing about what matters to them?"
  ],
  emotion: [
    "What emotions are present for you right now?",
    "Which emotion is most influencing how you're thinking?",
    "What emotion might come up for you that could throw you off if you're not careful?",
    "What's coming up for you as you think about this?"
  ],
  clarity: [
    "What feels unresolved at this point?",
    "What are you avoiding looking at directly?",
    "What specifically needs to be said that you're currently softening?",
    "What would clarity look like here?"
  ],
  commitment: [
    "What really matters most in this situation — for both of you?",
    "What's your next step?",
    "What are you ready to do?",
    "What would owning this well look like?"
  ]
};

// Helper: pick random question from category
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// TASK 1: HARD-LIMITED signal detection - strictly classificatory, no interpretation
async function extractSignals(sessionAnswers) {
  try {
    const answersText = sessionAnswers.map((a, i) => `Response ${i + 1}: ${a}`).join('\n\n');
    
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      temperature: 0,
      messages: [{
        role: 'user',
        content: `You are a pattern detector. Your role is strictly classificatory.

CRITICAL CONSTRAINTS:
- Detect ONLY surface patterns in language
- Do NOT infer personality traits, capabilities, motives, intent, or psychological states
- Do NOT explain, summarise, advise, or characterise the user
- Return ONLY boolean flags in JSON format
- Your output must NEVER be shown to the user

Here are the user's responses:

${answersText}

Detect surface-level language patterns only:

- emotional_escalation: Are emotion words increasing in frequency or intensity across responses?
- avoidance: Are responses consistently vague or indirect when asked direct questions?
- clarity_increasing: Are responses becoming more specific and concrete over time?
- self_other_blindspot: Do responses only mention the user's perspective (no mention of others)?
- premature_decision: Do responses include action statements before sufficient exploration?

Return ONLY this JSON structure with no additional text:
{
  "emotional_escalation": true/false,
  "avoidance": true/false,
  "clarity_increasing": true/false,
  "self_other_blindspot": true/false,
  "premature_decision": true/false
}`
      }]
    });

    const text = message.content[0].text.trim();
    const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(jsonText);
  } catch (error) {
    console.error('Signal detection error:', error);
    // Safe fallback: no signals detected
    return {
      emotional_escalation: false,
      avoidance: false,
      clarity_increasing: false,
      self_other_blindspot: false,
      premature_decision: false
    };
  }
}

// TASK 2: Question count as GOVERNING CONSTRAINT - creates stable thinking arc
function selectNextQuestion(session) {
  const questionCount = session.questionCount;
  const recentSignals = session.signals.slice(-2);
  const previousQuestions = session.questionHistory || [];
  
  let selectedQuestion;
  let reason;
  
  // PHASE 1: Question 1 - ONLY grounding/situation-clarifying
  if (questionCount === 1) {
    selectedQuestion = pickRandom(QUESTION_BANK.grounding);
    reason = "Q1: grounding phase (hard constraint)";
  }
  // PHASE 2: Question 2 - Commitment PROHIBITED
  else if (questionCount === 2) {
    if (recentSignals.some(s => s.emotional_escalation)) {
      selectedQuestion = pickRandom(QUESTION_BANK.emotion);
      reason = "Q2: emotional escalation detected";
    } 
    else if (recentSignals.some(s => s.self_other_blindspot)) {
      selectedQuestion = pickRandom(QUESTION_BANK.perspective);
      reason = "Q2: self-focused pattern";
    }
    else if (recentSignals.some(s => s.avoidance)) {
      selectedQuestion = pickRandom(QUESTION_BANK.clarity);
      reason = "Q2: avoidance detected";
    }
    else {
      selectedQuestion = pickRandom(QUESTION_BANK.perspective);
      reason = "Q2: default perspective";
    }
  }
  // PHASE 3: Questions 3-5 - Full logic, commitment gated
  else {
    // Commitment questions ONLY allowed if:
    // - questionCount >= 3
    // - AND no emotional escalation (at any point in session)
    // - AND no recent self/other blindspot
    const hasEverEscalated = session.signals.some(s => s.emotional_escalation);
    const commitmentAllowed = 
      questionCount >= 3 &&
      !hasEverEscalated &&
      !recentSignals.some(s => s.self_other_blindspot);
    
    if (recentSignals.some(s => s.emotional_escalation)) {
      selectedQuestion = pickRandom(QUESTION_BANK.emotion);
      reason = `Q${questionCount}: emotional escalation`;
    }
    else if (recentSignals.some(s => s.avoidance)) {
      selectedQuestion = pickRandom(QUESTION_BANK.clarity);
      reason = `Q${questionCount}: avoidance pattern`;
    }
    else if (recentSignals.some(s => s.self_other_blindspot)) {
      selectedQuestion = pickRandom(QUESTION_BANK.perspective);
      reason = `Q${questionCount}: self-focused`;
    }
    else if (recentSignals.some(s => s.premature_decision)) {
      selectedQuestion = pickRandom(QUESTION_BANK.grounding);
      reason = `Q${questionCount}: rushing to decide`;
    }
    else if (commitmentAllowed && recentSignals.some(s => s.clarity_increasing)) {
      selectedQuestion = pickRandom(QUESTION_BANK.commitment);
      reason = `Q${questionCount}: clarity → commitment (gated)`;
    }
    else {
      selectedQuestion = pickRandom(QUESTION_BANK.perspective);
      reason = `Q${questionCount}: default perspective`;
    }
  }
  
  // Avoid repeating questions
  let attempts = 0;
  while (previousQuestions.includes(selectedQuestion) && attempts < 5) {
    const allowedCategories = questionCount === 1 
      ? ['grounding'] 
      : questionCount === 2 
        ? ['emotion', 'perspective', 'clarity', 'grounding']
        : Object.keys(QUESTION_BANK);
    
    const randomCategory = allowedCategories[Math.floor(Math.random() * allowedCategories.length)];
    selectedQuestion = pickRandom(QUESTION_BANK[randomCategory]);
    attempts++;
  }
  
  return { question: selectedQuestion, reason };
}

// Start moment session
app.post('/api/start-moment', async (req, res) => {
  try {
    const { sessionId, momentId } = req.body;
    
    const moment = MOMENTS[momentId];
    if (!moment) {
      return res.status(404).json({ error: 'Moment not found' });
    }
    
    console.log(`✓ Starting session: ${sessionId} - ${moment.title}`);
    
    const firstQuestion = "What specifically is happening in this situation?";
    
    // Initialize session with cumulative memory
    sessions.set(sessionId, {
      pathway: 'moment',
      momentId,
      momentTitle: moment.title,
      answers: [],
      signals: [],
      questionHistory: [firstQuestion],
      questionCount: 1,
      startTime: Date.now()
    });
    
    res.json({
      pathway: 'moment',
      momentTitle: moment.title,
      framing: moment.framing,
      firstQuestion
    });
    
  } catch (error) {
    console.error('Error starting moment:', error);
    res.status(500).json({ error: 'Failed to start moment' });
  }
});

// Get next question (cumulative + phase-controlled)
app.post('/api/next-question', async (req, res) => {
  try {
    const { sessionId, answer } = req.body;
    
    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    console.log(`\n⚡ Q${session.questionCount} answered`);
    console.log(`   "${answer.substring(0, 60)}..."`);
    
    // Append answer to cumulative history
    session.answers.push(answer);
    
    // Check if complete
    if (session.questionCount >= 5) {
      console.log(`✓ Session complete`);
      return res.json({ complete: true });
    }
    
    const startTime = Date.now();
    
    // Extract signals (strictly classificatory)
    const signals = await extractSignals(session.answers);
    session.signals.push(signals);
    
    const detectionTime = Date.now() - startTime;
    
    console.log(`   🧠 Signals (${detectionTime}ms):`, signals);
    
    // Select next question (phase-controlled)
    const { question, reason } = selectNextQuestion(session);
    
    console.log(`   📍 "${question.substring(0, 50)}..."`);
    console.log(`   💡 ${reason}`);
    
    // Store and increment
    session.questionHistory.push(question);
    session.questionCount += 1;
    
    res.json({
      complete: false,
      nextQuestion: question,
      questionNumber: session.questionCount
    });
    
  } catch (error) {
    console.error('Error getting next question:', error);
    res.status(500).json({ error: 'Failed to generate next question' });
  }
});

// Custom situation
app.post('/api/start-custom', async (req, res) => {
  try {
    const { sessionId, situation } = req.body;
    
    console.log(`⚡ Starting custom session: ${sessionId}`);
    
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      temperature: 0.7,
      messages: [{
        role: 'user',
        content: `A leader described this situation:

"${situation}"

Ask them ONE focused question (15-25 words) that helps them think more clearly about their specific situation.

The question should:
- Reference specific details from what they said
- Help them clarify what's happening
- Be open-ended and non-judgmental

Return ONLY the question, nothing else.`
      }]
    });
    
    const firstQuestion = message.content[0].text.trim();
    
    sessions.set(sessionId, {
      pathway: 'custom',
      situation,
      answers: [],
      signals: [],
      questionHistory: [firstQuestion],
      questionCount: 1,
      startTime: Date.now()
    });
    
    res.json({
      pathway: 'custom',
      firstQuestion
    });
    
  } catch (error) {
    console.error('Error with custom situation:', error);
    res.status(500).json({ 
      error: 'Failed to start custom session',
      message: 'Sorry, something went wrong. Please try selecting a moment above instead.'
    });
  }
});

// Analytics
app.post('/api/analytics', (req, res) => {
  const { event, data } = req.body;
  console.log(`📊 ${event}`, data);
  res.json({ recorded: true });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    version: '5.0-constrained',
    sessions: sessions.size
  });
});

app.listen(PORT, () => {
  console.log(`\n✅ Discern Backend v5.0 - Constrained & Phase-Controlled`);
  console.log(`🌐 Server: http://localhost:${PORT}`);
  console.log(`\n🔒 Task 1: AI Hard-Limited`);
  console.log(`   → Strictly classificatory (no interpretation)`);
  console.log(`   → Surface patterns only`);
  console.log(`   → Cannot be shown to user`);
  console.log(`\n📐 Task 2: Question Count Governs Arc`);
  console.log(`   → Q1: Grounding only (hard constraint)`);
  console.log(`   → Q2: Commitment prohibited`);
  console.log(`   → Q3-5: Commitment gated (no emotion/blindspot)`);
  console.log(`\n💡 Result: Stable thinking arc, restrained AI`);
  console.log(`\n🧪 Ready!\n`);
});
