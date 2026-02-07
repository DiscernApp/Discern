// Discern AI Backend - With "Other Topic" Option
// All pathways use AI to generate situational questions
// Run with: node discern-backend-final.js

const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// IMPORTANT: Add your Claude API key here or set as environment variable
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'YOUR_API_KEY_HERE';

const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Store session contexts
const sessions = new Map();

// Serve the HTML file at root
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/discern-final.html');
});

// Moments including "Other topic"
const MOMENTS = {
  1: {
    id: 1,
    title: "Having a difficult conversation",
    framing: "This moment is about thinking clearly before you say something that matters. These conversations rarely feel easy. Often the instinct is to rehearse lines or try to fix the other person, when what may work best is getting yourself into the right state so the conversation has a chance to go well.",
    prompt_context: `The person is facing a difficult conversation they need to have. Generate questions that help them think clearly about what could be said, what might be being overlooked, what the real stakes could be, and what might get in the way of handling this well.`,
    situation_prompt: "What's the difficult conversation you need to have? Who is it with and what makes it difficult?"
  },
  2: {
    id: 2,
    title: "When everything feels urgent",
    framing: "This moment is about restoring perspective when everything feels important and time feels compressed. The pressure is real. Often the instinct is to do more faster, when what may work best is deciding what actually deserves your attention right now.",
    prompt_context: `The person is feeling overwhelmed with everything feeling urgent. Generate questions that help them distinguish what might truly be urgent, what could be driving the pressure, and what might matter most right now.`,
    situation_prompt: "What's making everything feel urgent right now? What are you juggling?"
  },
  3: {
    id: 3,
    title: "I need to say no to someone",
    framing: "This moment is about setting a boundary without damaging the relationship. Saying no often feels harder than it should. Often the instinct is to be harsh or over-explain, when what may work best is getting clear on what's fair.",
    prompt_context: `The person needs to say no to someone but is finding it difficult. Generate questions that help them clarify what might make this no necessary, what could be fair to both parties, and how the boundary might be communicated clearly.`,
    situation_prompt: "Who do you need to say no to, and what are they asking for?"
  },
  4: {
    id: 4,
    title: "Someone's upset with me",
    framing: "This moment is about responding to someone's upset without becoming defensive or dismissive. It can feel uncomfortable when someone's angry with you. Often the instinct is to prove you're right or fix their feelings, when what may work best is getting clear enough to show up well.",
    prompt_context: `Someone is upset with the person and they need to respond. Generate questions that help them see what might be true from the other person's perspective, what they might have missed, and how they could respond well.`,
    situation_prompt: "Who's upset with you and what happened?"
  },
  5: {
    id: 5,
    title: "I made a mistake",
    framing: "This moment is about owning a mistake clearly without spiralling into shame or defensiveness. Mistakes rarely feel easy to face. Often the instinct is to hide or over-apologise, when what may work best is getting clear on what happened so you can repair it well.",
    prompt_context: `The person has made a mistake and needs to address it. Generate questions that help them see what actually happened, what the real impact might be, who might need to know, and what owning it well could look like.`,
    situation_prompt: "What mistake did you make and what's the situation now?"
  },
  6: {
    id: 6,
    title: "I have a different topic to consider",
    framing: "This is for any other situation where you need clarity. Take a moment to describe what you're facing.",
    prompt_context: `The person has a situation that doesn't fit the standard moments. Generate questions tailored to their specific challenge that help them gain clarity about what's actually true, what might be being overlooked, what could really matter here, and what might get in the way of handling this well.`,
    situation_prompt: "What situation are you facing that you need to think through?"
  }
};

// Clarity-focused system prompt - open questions using modal operators of possibility
const SYSTEM_PROMPT = `You are Discern. Your job is to generate 5 questions that lead to clarity. After answering these questions, the person should know what to do next.

These questions create clarity by inviting honest reflection, not by assuming, leading, or forcing binary choices.

CRITICAL RULES:

1. **Use modal operators of possibility**
   - Use: could, might, may
   - "What could be said..." not "What needs to be said..."
   - "What might you be avoiding..." not "What are you avoiding..."
   - "What may happen if..." not "What will happen when..."
   - This keeps questions open and non-assumptive

2. **Genuinely open-ended questions**
   - NEVER: Yes/no questions, binary choices, or forced options
   - NEVER: "Is X the problem or is Y the problem?"
   - NEVER: "Do you need to..." or "Should you..."
   - YES: "What..." "How..." questions that invite thinking

3. **Reference their specific situation**
   - Use the exact names, roles, and details they provided
   - Make questions impossible to answer generically
   - Show you understood their exact scenario

4. **No assumptions about what's true**
   - Don't assume someone is wrong, right, or at fault
   - Don't assume what will happen
   - Don't assume what they're feeling or avoiding
   - Invite them to discover, don't tell them what's there

5. **Focus on clarity, not therapy**
   - Questions should reveal what's actually true
   - Questions should surface what might be being overlooked
   - Questions should help them see what could matter most
   - NOT: processing emotions, exploring feelings, or therapeutic insight

QUESTION STRUCTURE:
- 12-25 words
- One clear focus per question
- Uses modal operators (could, might, may)
- Completely open-ended
- Specific to their situation

The 5 questions should help them gain clarity about:
1. What's actually true in this situation (separate fact from story)
2. What might be being overlooked or avoided
3. What the real stakes or consequences could be
4. What might matter most here (cutting through noise)
5. What might get in the way of handling this well

OUTCOME TEST: After answering these 5 questions, the person should have clarity about what to do. If they're still confused or need to "process more", the questions failed.

BANNED PHRASES:
- "What do you imagine..."
- "What's the gift..."
- "What's really going on for you..."
- "Is [X] or [Y]..." (binary choices)
- "Do you..." "Should you..." "Are you..."
- "What evidence do you have..."

Return ONLY valid JSON:
{
  "questions": [
    "Question 1",
    "Question 2", 
    "Question 3",
    "Question 4",
    "Question 5"
  ]
}

No preamble. No explanation. Just the JSON.`;

// Generate AI questions for any moment
app.post('/api/generate-questions', async (req, res) => {
  try {
    const { sessionId, momentId, situation } = req.body;
    const startTime = Date.now();
    
    const moment = MOMENTS[momentId];
    if (!moment) {
      return res.status(404).json({ error: 'Moment not found' });
    }
    
    console.log(`⚡ Session ${sessionId} - ${moment.title}`);
    console.log(`   Situation: ${situation.substring(0, 100)}...`);
    
    // Generate AI questions with moment context + user situation
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Moment: ${moment.title}

Context: ${moment.prompt_context}

The person's specific situation:
"${situation}"

Generate 5 highly situational questions for this exact scenario.`
      }]
    });
    
    const generationTime = Date.now() - startTime;
    const inputTokens = message.usage.input_tokens;
    const outputTokens = message.usage.output_tokens;
    const estimatedCost = (inputTokens * 0.000003) + (outputTokens * 0.000015); // Claude Sonnet 4 pricing
    
    // Parse AI response
    let questions;
    let retryAttempted = false;
    
    try {
      const text = message.content[0].text.trim();
      const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(jsonText);
      questions = parsed.questions;
      
      if (!Array.isArray(questions) || questions.length !== 5) {
        throw new Error('Invalid questions format');
      }
    } catch (parseError) {
      console.error('Parse error, retrying...', message.content[0].text);
      retryAttempted = true;
      
      // Retry once
      const retryMessage = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Moment: ${moment.title}

Context: ${moment.prompt_context}

The person's specific situation:
"${situation}"

Generate 5 questions. IMPORTANT: Return ONLY the JSON object, no other text.`
        }]
      });
      
      const retryText = retryMessage.content[0].text.trim();
      const retryJsonText = retryText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const retryParsed = JSON.parse(retryJsonText);
      questions = retryParsed.questions;
    }
    
    sessions.set(sessionId, {
      momentId,
      momentTitle: moment.title,
      situation,
      questions,
      startTime,
      generationTime,
      inputTokens,
      outputTokens,
      estimatedCost,
      retryAttempted
    });
    
    console.log(`  → Generated in ${generationTime}ms`);
    console.log(`  → Cost: $${estimatedCost.toFixed(4)} (${inputTokens}in + ${outputTokens}out tokens)`);
    if (retryAttempted) console.log(`  → Retry was needed`);
    
    res.json({
      momentTitle: moment.title,
      framing: moment.framing,
      questions,
      generationTime,
      cost: estimatedCost
    });
    
  } catch (error) {
    console.error('Error generating questions:', error);
    res.status(500).json({ 
      error: 'Failed to generate questions',
      message: error.message
    });
  }
});

// Get available moments
app.get('/api/moments', (req, res) => {
  res.json({
    moments: Object.values(MOMENTS).map(m => ({
      id: m.id,
      title: m.title,
      situation_prompt: m.situation_prompt
    }))
  });
});

// Analytics endpoint
app.post('/api/analytics', (req, res) => {
  const { event, data } = req.body;
  const timestamp = new Date().toISOString();
  console.log(`📊 ${timestamp} | ${event}`, JSON.stringify(data, null, 2));
  res.json({ recorded: true });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    version: '3.1-with-other-topic',
    sessions: sessions.size,
    moments: Object.keys(MOMENTS).length,
    ai_enabled: !!ANTHROPIC_API_KEY && ANTHROPIC_API_KEY !== 'YOUR_API_KEY_HERE'
  });
});

app.listen(PORT, () => {
  console.log(`\n✅ Discern Backend v3.1`);
  console.log(`🌐 Server: http://localhost:${PORT}`);
  console.log(`🔑 API Key: ${ANTHROPIC_API_KEY === 'YOUR_API_KEY_HERE' ? 'NOT CONFIGURED' : ANTHROPIC_API_KEY.substring(0, 20) + '...'}`);
  console.log(`\n🎯 Moments:`);
  Object.values(MOMENTS).forEach(m => {
    console.log(`   ${m.id}) ${m.title}`);
  });
  console.log(`\n⚡ All questions generated by AI based on user's specific situation`);
  console.log(`📊 Analytics: Enabled`);
  console.log(`🧪 Ready for testing!\n`);
});
