import Fastify from "fastify";
import WebSocket from "ws";
import dotenv from "dotenv";
import fastifyFormBody from "@fastify/formbody";
import fastifyWs from "@fastify/websocket";
import mongoose from "mongoose";
import Slot from "./api/models/slot.model.js";
import axios from "axios";
// Load environment variables from .env file
dotenv.config();

// Retrieve the OpenAI API key from environment variables.
const { OPENAI_API_KEY } = process.env;


const ZAPIER_WEBHOOK_URL = "https://hook.eu2.make.com/wygxhcbj9sr0qv9xs3r5h702e4jipxcx";

let conversationHistory = [];

const sendTranscriptToZapier = async (streamSid) => {
  try {
    if (!conversationHistory || conversationHistory.length === 0) {
      console.log('No conversation history to send for stream:', streamSid);
      return;
    }
    const formattedTranscript = formatTranscript(conversationHistory);
    if (!formattedTranscript) {
      console.error('Failed to format transcript');
      return;
    }
    const transcriptData = {
      streamSid: streamSid,
      timestamp: new Date().toISOString(),
      transcript: formattedTranscript,
      totalMessages: conversationHistory.length,
      rawConversation: conversationHistory // Include raw data for debugging
    };

    // Debug logging
    console.log('Preparing to send transcript:', {
      streamSid,
      messageCount: conversationHistory.length,
      firstMessage: conversationHistory[0],
      lastMessage: conversationHistory[conversationHistory.length - 1]
    });

    const response = await fetch(ZAPIER_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Stream-ID': streamSid // Add tracking header
      },
      body: JSON.stringify(transcriptData)
    });
    const responseText = await response.text();
    console.log('Zapier Response:', {
      status: response.status,
      statusText: response.statusText,
      body: responseText
    });

    if (!response.ok) {
      throw new Error(`Failed to send transcript: ${response.statusText}`);
    }

    console.log(`Transcript sent successfully for stream ${streamSid}`);
    conversationHistory = [];
  } catch (error) {
    console.error('Error sending transcript to Zapier:', error);
  }
};

const formatTranscript = (history) => {
  return history.map(entry => {
    const timestamp = new Date(entry.timestamp).toISOString();
    const role = entry.role === 'user' ? 'Customer' : 'AI Assistant';
    return `[${timestamp}] ${role}: ${entry.content}`;
  }).join('\n');
};

if (!OPENAI_API_KEY) {
  console.error("Missing OpenAI API key. Please set it in the .env file.");
  process.exit(1);
}

mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection;
db.on("error", (err) => {
  console.log(err);
});

db.once("open", () => {
  console.log("Database Connected");
});

// Initialize Fastify
const fastify = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

// Constants
const SYSTEM_MESSAGE = `Style

Go slow. Make sure you understand the input from the user in a deep and nuanced way. Ask for clarification to enable a concise response. If user start speaking in between your response than stop speaking and ask user their user. If user provide some uncomplete response than ask user to provide the complete query like (sir you were saying something, can you please complete it). 

Keep your responses to a maximum three sentences. Use the last sentence to query the user for clarification or to move the conversation further down the sales/marketing funnel. Do not repeat a response and response one query at a time. Respond according to the instructions and do not mix all the flows in a response. Responses should be stable.

Ensure that the actions and responses should be according to the required tool call results do not respond any thing from your side. 

On the beginning of the conversation every time call the tool "getDateAndTime" to recognize the real date and time. And after recognizing real current date and time automatically understand the dates and days users referring to by using words like Tomorrow, yesterday, day after tomorrow.  And schedule classes and appointments according the real date and time which be the the result of the tool "getDateAndTime" call. Do not speak the date and time if not asked.
Do not provide the time availability without checking the tool call results of tool "getDateAndTime" and "checkAvailability".

Do pause the conversation in between if you are checking something then response with the update from your side. Do not remain silence.

Every time when a user provides details like name, contact, email then every time confirm these details with user and For the email address confirmation, repeat each character and segment to ensure clarity. For example, say, “Just to confirm, your email is [Email Address]. That’s spelled as [spell out each part clearly, including special characters like underscore, dot, or hyphen]. Is that correct?”

Once a user have provided its contact details do not ask the details again for further actions and retrieve the details from conversation. Once the user confirms each piece of information, proceed with the conversation.

Be concise while speaking in a natural human manner. Keep your responses to a maximum of three sentences.

If a user say words like "Hello", "Hi" in between a conversation then do not start a new conversation like "Hi, How can i assist you today" instead of this continue with the response of on going conversation.

Before booking a free trail class always call the function "getDateAndTime" to recognize the real date and time. And after getting the results of the tool call the system should convert the preferred day and time into the nearest upcoming day, or the day of this current week if it hasn’t passed yet. It should never provide a date or time that has already passed. And after recognizing this first make sure to confirm the user about the day, date and time for trail class and then then on user approval book the trail class.


Respond in a way that is friendly, conversational, and engaging. Imagine you are talking to a close friend. Use a warm tone, show empathy, and be enthusiastic about the topic. Avoid sounding too formal or robotic. Do not repeat any response if not asked.

You are forbidden to use complex English words.
/Style

Context
You are the automated assistant for Fight Flow Academy in Raleigh, North Carolina. 

Address: 900 E Six Forks Rd. 

Cross street: Atlantic Ave. 

Phone: (919) 532-4050
/Context


General Guidelines:
- Engage potential members professionally, provide accurate information on classes and membership options.
- Call the function "checkAvailability" and "BookAppointment"  only if the user ask to set up an appointment with staff member and ensure not to call these function "checkAvailability" and "BookAppointment" when a user ask to schedule a trail class.
- Ensure that each response generated is unique and doesn't repeat the phrasing or content of previous responses.
- Provide concise, clear, and relevant responses.
- Focus on addressing the user's specific needs and queries.
- Do not repeat any response if not asked.
- Determine the real-time to provide accurate information for scheduling.
- Offer additional assistance without being pushy or repetitive.
- Keep the answers short, to the point and concise.
- Do ask user details for multiple times get the user details from history conversation in the same call.
- Avoid repetition of sentences or words in a single response and do not repeat last response in a new query.
- Recognize the current date, day and time to schedule a class or appointment and to provide availabilities option to user.
- Do not speak the last message  from conversation history.
- Do not confirm any thing multiple times.
/General Guidelines

Capabilities:

When asked about your capabilities, respond:
"I can assist you with information about our programs, schedule free trial classes, and arrange appointments with our staff members. How may I help you today?"
/Capabilities

Class Categories: 

- Brazilian Jiu-Jitsu and submission grappling.
- Muay Thai [pronounce "moy thai"].
- Boxing and Kickboxing.
- Mixed Martial Arts.
- Youth Martial Arts, including Brazilian Jiu Jitsu, Muay Thai, and Boxing.
- We offer a "24/7 Gym Access" membership that does not include classes. 
- Pronounce 24/7 as "twenty-four by seven" instead of "twenty-four slash seven"
/Class Categories

IMPORTANT Regarding pricing inquiries

When responding to pricing requests, ask questions to understand the prospect's areas of interest. 

Prospects will usually want some combination of Class Categories. Respond with pricing relevant to the prospect. 

/IMPORTANT Regarding pricing inquiries

MEMBERSHIP PRICES

24/7 Gym Access (classes not included): $69 per month, plus a one-time registration fee of $50.
- Do not Pronounce 24/7 as "Twenty-Four Slash Seven" instead pronounce " Twenty-Four by Seven".

Class-inclusive memberships:

- ALL CLASSES + 24/7 Access - $189 / Month + $50 registration 
  - This is the best value, as you get unlimited classes of all types.

We have several that are for people who are interested in a specific discipline:

- Muay Thai Only + 24/7 Access - $139 per month + $50 registration 
  - Unlimited 

- Off Peak Classes + 24/7 Access - $129 / month + $50 registration 
- Brazilian Jiujitsu and Grappling + 24/7 Access - $149 / Month + $50 registration 
- Boxing/Kickboxing/Fitness + 24/7 Access (no Moy Thai or MMA) - $149 / Month + $50 registration 
- MMA/Muay Thai/Grappling + 24/7 Access - $169 / Month + $50 registration 
- All Striking Classes + 24/7 Access - $169 / Month + $50 registration 

/MEMBERSHIP PRICES




CLASS SCHEDULE INSTRUCTIONS:
- Ask the user for their full name, contact number, email address, and preferred class timing.
- If the user is booking a youth class, ask for the age of the student along with the details mentioned above.
- Before booking a free trail class, every time call the "getDateAndTime" tool to fetch the current date, time, and day and wait for the tool call results before scheduling the class and after getting the tool call results book the class according to the resultant current date, day and time. And before booking the class every time confirm the user day, date and time of class.
- Use the result to ensure correct scheduling but do not verbally communicate the output unless the user requests it.
-Ask the user for their availability to find the best day and time for the class.
- Provide only the available class schedules for the preferred day, drawn from the knowledge base.
-Gather user details only once and retrieve them from conversation history for future steps.
- When multiple classes are booked, extract user details, class type, and preferred time slot for each and store each class in a new row.
- After booking, confirm the details: "Thank you, [Name]. Your trial class for [Class] is scheduled for [Day] at [Time] on [Date]. You'll receive a confirmation email shortly with all relevant details. Is there anything else I can assist you with?"
- If the user mentions terms like "today" or "tomorrow", the system should interpret them based on the current date and time and record the correct day.
/CLASS SCHEDULE INSTRUCTIONS:

Classes Schedule: 
1.Boxing Bootcamp
- Monday: 6:15 am Boxing Bootcamp
- Wednesday: 6:15 am Boxing Bootcamp
- Friday: 6:15 am Boxing Bootcamp
- Monday: 6:30 pm Boxing Bootcamp
- Wednesday: 6:30 pm Boxing Bootcamp
- Thursday: 6:30 pm Boxing Bootcamp

2.Kickboxing 
- Tuesday: 6:15 am Kickboxing 
- Tuesday: 6:30 pm Kickboxing 
- Friday: 5:30 pm Kickboxing 

3.Submission Wrestling / Grappling - for free trials, offer with Jiu Jitsu (Gi)
- Monday: 12:30 pm Submission Wrestling
- Tuesday: 12:30 pm Submission Wrestling
- Thursday: 12:30 pm Submission Wrestling
- Tuesday: 7:00 pm Submission Wrestling
- Thursday: 7:00 pm Submission Wrestling

4.Brazilian Jiu-Jitsu - for free trials, offer with Submission Wrestling / Grappling
- Monday: 5:30 pm Brazilian Jiu-Jitsu
- Wednesday: 5:30 pm Brazilian Jiu-Jitsu

5.MMA/Muay Thai Coached Sparring
- Tuesday: 5:30 pm MMA/Muay Thai Coached Sparring
- Thursday: 5:30 pm MMA/Muay Thai Coached Sparring
 
6.Boxing Technique
- Monday: 7:30 pm Boxing Technique
- Tuesday: 7:30 pm Boxing Technique
- Wednesday: 7:30 pm Boxing Technique
- Thursday: 7:30 pm Boxing Technique

7.Boxing Sparring
 Wednesday: 8:30 pm Boxing Sparring

8.Muay Thai
- Monday: 7:00 pm Muay Thai
- Wednesday: 7:00 pm Muay Thai
- Saturday: 9:00 am Muay Thai
- Sunday: 4:30 pm Muay Thai

9.HIIT Boxing
- Saturday: 8:00 am HIIT Boxing

10.MMA Skills and Sparring
- Friday: 6:00 pm MMA Skills and Sparring

/Classes Schedule

Appointment Scheduling with staff member:
- If the user asks to book an appointment to talk with staff, then ask user for:
  Full name,
  Contact number
  Email,
  Preferred appointment date and time for the appointment
- After getting preferred time slot for appointment with staff member only from user side Use the "CheckAvailability" tool to check for conflicts. Double-check the timeslot for availability.
- If the time slot is not available then ask user to provide some other preferred time slot.
- If the user provides a time slot that has already passed, kindly inform them that the selected time is no longer available and ask them to provide another upcoming time slot in the future.
- After checking the availability of preferred appointment slot with staff member by calling "checkAvailability" if the preferred time slot for appointment with staff member is available then call the "BookAppointment" tool for booking a appointment with staff member after the call end and if a user reschedules the appointment with staff member, then consider the latest appointment time.
- "I’ve scheduled your appointment with staff member for [Date] at [Time]. You’ll receive a confirmation email shortly. Is there anything else I can assist you with?"
- Ensure that the system accurately recognizes and records the actual day and time when a user books an appointment or class using terms like "tomorrow" or "today." The system should interpret these terms based on the current date and time, then record the corresponding recognized day and time accurately in the system.
- Always pronounce times in a user-friendly format (e.g., "7 pm" instead of "seven zero zero pm").

/Appointment Scheduling with staff member

Handling Out-of-Scope Queries:
- Politely acknowledge the question and redirect to appropriate resources or staff members when necessary.

/Handling Out-of-Scope Queries

Concluding the Interaction:
- If no further assistance is needed, conclude with: "Thank you for your interest in Fight Flow Academy. We look forward to welcoming you. Have a great day! Goodbye."

/Concluding the Interaction

Handling Cancellations or Rescheduling:
- If the user wants to cancel or reschedule the free trial or appointment with a staff member, ask for their name and contact number. After getting these details, cancel or reschedule the class or appointment and then confirm the user about their query.

/Handling Cancellations or Rescheduling

Alternative Closing Queries:
- After addressing the query, ask a different short alternative to "Is there anything else I can help you with?" every alternate time. If the user indicates no further assistance is needed, then thank the user with: "You’re welcome! We look forward to seeing you at Fight Flow Academy. Have a great day! Goodbye". Ensure that the interaction does not end in the middle of the conversation due to confirmations or rejections of other things, except when the user confirms no further assistance is needed. Always ask if there is anything else after every query, and if the user says no further assistance is needed, then thank the user and end the interaction with goodbye.

/Alternative Closing Queries

Additional Instructions:
- Ensure that each response generated is unique and doesn't repeat the phrasing or content of previous responses.
- Always pronounce times in a user-friendly format (e.g., "7 pm" instead of "seven zero zero pm" and "12:30 AM" as "twelve thirty AM".).
- Ensure responses are concise and avoid using fillers.
- Ensure that the system accurately recognizes and records the actual day and time when a user books an appointment or class using terms like "tomorrow" or "today." The system should interpret these terms based on the current date and time, then record the corresponding recognized day and time accurately in the system.
- Always provide the same response for the same query to maintain consistency and reliability.
- Utilize casual language, contractions, and natural phrasing. Ensure empathy and friendly tone throughout. Break down complex sentences into simpler ones for clarity and brevity. Introduce synonyms and varied phrases to avoid repetition. Incorporate user data and context for personalized interactions. Add encouraging language, feedback acknowledgment, and motivational prompts to keep users engaged.
- If a user responds with something outside the given parameters, handle it correctly on your own. After processing their out-of-scope query, ask for confirmation if there is anything else and if they need assistance, go ahead with further queries.
/Additional Instructions`;


const VOICE = "alloy";
const PORT =  process.env.PORT || 5050 ; // Allow dynamic port assignment

// List of Event Types to log to the console. See the OpenAI Realtime API Documentation: https://platform.openai.com/docs/api-reference/realtime
const LOG_EVENT_TYPES = [
  "error",
  "response.content.done",
  "rate_limits.updated",
  "response.done",
  "input_audio_buffer.committed",
  "input_audio_buffer.speech_stopped",
  "input_audio_buffer.speech_started",
  "session.created",
];

// Show AI response elapsed timing calculations
const SHOW_TIMING_MATH = false;

// Root Route
fastify.get("/", async (request, reply) => {
  reply.send({ message: "Twilio Media Stream Server is runnin!" });
});

// Route for Twilio to handle incoming calls
// <Say> punctuation to improve text-to-speech translation
fastify.all("/incoming-call", async (request, reply) => {
  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
                          <Response>
                              <Connect>
                                  <Stream url="wss://${request.headers.host}/media-stream" />
                              </Connect>
                          </Response>`;

  reply.type("text/xml").send(twimlResponse);
});

const tools = [
  {
    type: "function",
    name: "get_current_time",
    description:
      "Use this function to retrieve the current date and time in IST format.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    type: "function",
    name: "check_availability",
    description:
      "Use this function to check the availability of classes if class is booked or not for another person",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    type: "function",
    name: "book_slots",
    description:
      "Use this function to book an appointment, don't run this tool when user books a free trial class it is for only book appointment",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "name of the person" },
        contact_number: {
          type: "string",
          description: "Contact number of the person",
        },
        email: { type: "string", description: "email of the person" },
        time: {
          type: "string",
          description: "Time for the appointment, e.g., '12:00 PM'",
        },
        date: {
          type: "string",
          description: "Date for the appointment, e.g., '2024-11-02'",
        },
      },
      required: ["name", "contact_number", "email", "time", "date"],
    },
  },
  {
    type: "function",
    name: "extract_customer_class_info",
    description: "Use this function after the call ends to  Extract and validate customer information and class details from conversation ",
    parameters: {
      type: "object",
      properties: {
        customer_info: {
          type: "object",
          description: "Customer's personal information",
          properties: {
            name: { 
              type: "string", 
              description: "Full name of the customer" 
            },
            contact_number: { 
              type: "string", 
              description: "Customer's contact number with country code" 
            },
            email: { 
              type: "string", 
              description: "Customer's email address" 
            }
          },
          required: ["name", "contact_number", "email"]
        },
        class_details: {
          type: "object",
          description: "Details about the class being scheduled",
          properties: {
            class_type: { 
              type: "string", 
              description: "Type of class (e.g., Boxing, Muay Thai, Brazilian Jiu-Jitsu)",
              enum: [
                "Boxing Bootcamp",
                "Kickboxing",
                "Submission Wrestling",
                "Brazilian Jiu-Jitsu",
                "MMA/Muay Thai Coached Sparring",
                "Boxing Technique",
                "Boxing Sparring",
                "Muay Thai",
                "HIIT Boxing",
                "MMA Skills and Sparring"
              ]
            },
            preferred_time: { 
              type: "string", 
              description: "Preferred time for the class in 12-hour format (e.g., '10:30 AM')",
              pattern: "^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$"
            },
            preferred_date: { 
              type: "string", 
              description: "Preferred date for the class (YYYY-MM-DD format)",
              pattern: "^\\d{4}-\\d{2}-\\d{2}$"
            },
            is_trial_class: {
              type: "boolean",
              description: "Indicates if this is a trial class"
            }
          },
          required: ["class_type", "preferred_time", "preferred_date", "is_trial_class"]
        }
      },
      required: ["customer_info", "class_details"]
    }
  }
];

// WebSocket route for media-stream
fastify.register(async (fastify) => {
  fastify.get("/media-stream", { websocket: true }, (connection, req) => {
    console.log("Client connected");

    // Connection-specific state
    let streamSid = null;
    let latestMediaTimestamp = 0;
    let lastAssistantItem = null;
    let markQueue = [];
    let responseStartTimestampTwilio = null;

    const openAiWs = new WebSocket(
      "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01",
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Beta": "realtime=v1",
        },
      }
    );

    // Control initial session with OpenAI
    const initializeSession = () => {
      const sessionUpdate = {
        type: "session.update",
        session: {
          turn_detection: { type: "server_vad" },
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          voice: VOICE,
          instructions: SYSTEM_MESSAGE,
          modalities: ["text", "audio"],
          temperature: 0.8,
          tools: tools, // New
          tool_choice: "auto", // New
        },
      };

      console.log("Sending session update:", JSON.stringify(sessionUpdate));
      openAiWs.send(JSON.stringify(sessionUpdate));

      // Uncomment the following line to have AI speak first:
      // sendInitialConversationItem();
    };

    // Send initial conversation item if AI talks first
    const sendInitialConversationItem = () => {
      const initialConversationItem = {
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Hello, this is Fight Flow Academy. I can provide information about our programs, help you set up a free trial class, or connect you with a staff member. How can I assist you today?",
            },
          ],
        },
      };

      if (SHOW_TIMING_MATH)
        console.log(
          "Sending initial conversation item:",
          JSON.stringify(initialConversationItem)
        );
      openAiWs.send(JSON.stringify(initialConversationItem));
      openAiWs.send(JSON.stringify({ type: "response.create" }));
    };

    // Handle interruption when the caller's speech starts
    const handleSpeechStartedEvent = () => {
      if (markQueue.length > 0 && responseStartTimestampTwilio != null) {
        const elapsedTime = latestMediaTimestamp - responseStartTimestampTwilio;
        if (SHOW_TIMING_MATH)
          console.log(
            `Calculating elapsed time for truncation: ${latestMediaTimestamp} - ${responseStartTimestampTwilio} = ${elapsedTime}ms`
          );

        if (lastAssistantItem) {
          const truncateEvent = {
            type: "conversation.item.truncate",
            item_id: lastAssistantItem,
            content_index: 0,
            audio_end_ms: elapsedTime,
          };
          if (SHOW_TIMING_MATH)
            console.log(
              "Sending truncation event:",
              JSON.stringify(truncateEvent)
            );
          openAiWs.send(JSON.stringify(truncateEvent));
        }

        connection.send(
          JSON.stringify({
            event: "clear",
            streamSid: streamSid,
          })
        );

        // Reset
        markQueue = [];
        lastAssistantItem = null;
        responseStartTimestampTwilio = null;
      }
    };

    // Send mark messages to Media Streams so we know if and when AI response playback is finished
    const sendMark = (connection, streamSid) => {
      if (streamSid) {
        const markEvent = {
          event: "mark",
          streamSid: streamSid,
          mark: { name: "responsePart" },
        };
        connection.send(JSON.stringify(markEvent));
        markQueue.push("responsePart");
      }
    };

    // Open event for OpenAI WebSocket
    openAiWs.on("open", () => {
      console.log("Connected to the OpenAI Realtime API");
      setTimeout(initializeSession, 100);
    });

    // Listen for messages from the OpenAI WebSocket (and send to Twilio if necessary)
    openAiWs.on("message", async (data) => {
      try {
        const response = JSON.parse(data);

        // Track user messages
        if (response.type === "conversation.item.text.created" && response.item.role === "user") {
          conversationHistory.push({
            timestamp: Date.now(),
            role: "user",
            content: response.item.text
          });
        }

        // Track assistant responses
        if (response.type === "response.content.done" && response.content) {
          conversationHistory.push({
            timestamp: Date.now(),
            role: "assistant",
            content: response.content
          });
        }
      } catch (error) {
        console.error("Error processing message for transcript:", error);
      }
      try {
        const response = JSON.parse(data);

        // console.log(`Received event: ${response.type}`, response);
        // console.log("Error details:", response.response.status_details.error);


        if (response.type === "response.function_call_arguments.done") {
          const function_name = response.name;
          let function_arguments = JSON.parse(response.arguments);
          console.log("Function Arguments", function_arguments);



          // Define webhook URLs based on function name
          let webhookUrl = "";
          if (function_name === "get_current_time") {
            webhookUrl = "https://hook.eu2.make.com/ayveb9yav2krkjdu3cne64xgvkytoh4m";
          } else if (function_name === "check_availability") {
            webhookUrl = "https://hook.eu2.make.com/y6evicoqgttu95xrn0crogh4nir2hbd7";
          }
          else if (function_name === "extract_customer_class_info") {
            webhookUrl = "https://hook.eu2.make.com/wygxhcbj9sr0qv9xs3r5h702e4jipxcx";
          }
          else if (function_name === "book_slots") {
            webhookUrl = "https://hook.eu2.make.com/7u77w31a79g5m5sp4b7w1c71nkwtatyf";
            // Convert 'start' to a Date object based on provided 'date' and 'time'
            const startDateTime = `${function_arguments.date} ${function_arguments.time}`;
            // );
            // const endDateTime = new Date(startDateTime.getTime() + 30 * 60000);

            function_arguments.start = startDateTime;
            // function_arguments.end = endDateTime;
            console.log(
              "Function Arguments with Start and End Dates:",
              function_arguments
            );
          }

          // Send a request to the webhook URL
          const result = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(function_arguments),
          })
            .then(async (res) => {
              const contentType = res.headers.get("content-type");
              if (contentType && contentType.includes("application/json")) {
                return await res.json();
              } else {
                return { error: await res.text() };
              }
            })
            .catch((err) => ({ error: err.message }));

          const functionOutputEvent = {
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: response.call_id,
              output: JSON.stringify(result),
            },
          };

          console.log("Result:", result);
          openAiWs.send(JSON.stringify(functionOutputEvent));
          openAiWs.send(JSON.stringify({ type: "response.create" }));
        }





        if (response.type === "response.audio.delta" && response.delta) {
          const audioDelta = {
            event: "media",
            streamSid: streamSid,
            media: {
              payload: Buffer.from(response.delta, "base64").toString("base64"),
            },
          };
          connection.send(JSON.stringify(audioDelta));

          // First delta from a new response starts the elapsed time counter
          if (!responseStartTimestampTwilio) {
            responseStartTimestampTwilio = latestMediaTimestamp;
            if (SHOW_TIMING_MATH)
              console.log(
                `Setting start timestamp for new response: ${responseStartTimestampTwilio}ms`
              );
          }

          if (response.item_id) {
            lastAssistantItem = response.item_id;
          }

          sendMark(connection, streamSid);
        }

        if (response.type === "input_audio_buffer.speech_started") {
          handleSpeechStartedEvent();
        }
      } catch (error) {
        console.error(
          "Error processing OpenAI message:",
          error,
          "Raw message:",
          data
        );
      }
    });

    // Handle incoming messages from Twilio
    connection.on("message", (message) => {
      try {
        const data = JSON.parse(message);

        switch (data.event) {
          case "media":
            latestMediaTimestamp = data.media.timestamp;
            if (SHOW_TIMING_MATH)
              console.log(
                `Received media message with timestamp: ${latestMediaTimestamp}ms`
              );
            if (openAiWs.readyState === WebSocket.OPEN) {
              const audioAppend = {
                type: "input_audio_buffer.append",
                audio: data.media.payload,
              };
              openAiWs.send(JSON.stringify(audioAppend));
            }
            break;
          case "start":
            streamSid = data.start.streamSid;
            console.log("Incoming stream has started", streamSid);

            // Reset start and media timestamp on a new stream
            responseStartTimestampTwilio = null;
            latestMediaTimestamp = 0;
            break;
          case "mark":
            if (markQueue.length > 0) {
              markQueue.shift();
            }
            break;
          default:
            console.log("Received non-media event:", data.event);
            break;
        }
      } catch (error) {
        console.error("Error parsing message:", error, "Message:", message);
      }
    });

    // Handle connection close
    connection.on("close", () => {
      if (conversationHistory.length > 0) {
        sendTranscriptToZapier(streamSid);
      }
      if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
      console.log("Client disconnected. Transcript sent.");
      conversationHistory = []; //
    });

    // Handle WebSocket close and errors
    openAiWs.on("close", () => {
      console.log("Disconnected from the OpenAI Realtime API");
    });

    openAiWs.on("error", (error) => {
      console.error("Error in the OpenAI WebSocket:", error);
    });
  });
});

fastify.listen({ port: PORT }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server is listening on port ${PORT}`);
});
