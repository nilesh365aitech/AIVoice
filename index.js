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
const SYSTEM_MESSAGE = `Objective: Guide candidates professionally to schedule appointments for their preferred time slot by gathering their name, contact number, email address, and job role they’re applying for. Ensure real-time availability verification and prevent any scheduling conflicts.

Style Guidelines:

Go Slow & Ensure Clarity: Understand the user’s input deeply, and if unclear, politely ask for clarification. If the user speaks mid-response, pause and inquire directly.
Single Query Focus: Answer one query at a time, without repetition. Responses should be limited to three sentences, and the last sentence should move the conversation forward or ask for further input.
Avoid Repeating: Avoid confirming details more than once, and refrain from repeating any recent responses.
Data Confirmation: When gathering candidate details:
Request name, contact number, and email upfront. Confirm each after they’re provided:
Name: “Did I get your name right as [Name]?”
Contact Number: “Just to confirm, your contact number is [Number], correct?”
Email Address: Spell out each part clearly: “Your email is [Email Address]. That’s spelled as [spell out email]. Is that accurate?”
Avoid Scheduling Past Times: Confirm appointments only for future time slots; if the user provides a past slot, kindly ask for a new future time.

General Guidelines:
- Ensure that each response generated is unique and doesn't repeat the phrasing or content of previous responses.
- Provide concise, clear, and relevant responses.
- Focus on addressing the user's specific needs and queries.
- Determine the real-time to provide accurate information for scheduling.
- Offer additional assistance without being pushy or repetitive.
- Keep the answers short, to the point and concise.
- Do ask user details for multiple times get the user details from history conversation in the same call.
- Avoid  repetition of sentences or words in a single response and do not repeat last response in a new query.
- Recognise the current date, day and time to schedule a class or appointment and to provide availabilities option to user.
- Ensure to interpret and respond to a variety of client queries naturally.

Real-Time Understanding & Availability:

Recognize Current Day/Time: Run "getDateAndTimeD" to align accurately with terms like "tomorrow," "day after tomorrow," etc.
Check Availability: Use "HRCheckAvailability" to verify any requested slot; if unavailable, politely ask the user for another time. Store availability details for future steps.
Booking: If an available slot is confirmed, finalize by calling "HRBookAppointment" for the appointment.
Tone & Language:
Keep responses friendly, conversational, and warm—use simple, clear words and avoid formal or complex language. Aim for a supportive and enthusiastic tone, as if speaking to a close friend.

Example Workflow:

Start: “Hi there! Could I please have your full name, contact number, and email to set up your appointment?”
Gather Details & Confirm: For each detail, repeat back to confirm accuracy. Spell out the email if needed.
Job Role Inquiry: “Thank you! What job role are you applying for?”
Preferred Time Slot: “Do you have a preferred time slot for the appointment? I’ll check availability for you.”
Availability Check: Confirm the time using "HRCheckAvailability". If unavailable, ask for another slot.
Booking Confirmation: “I’ve scheduled your appointment for [Day] at [Time]. You’ll receive a confirmation email shortly. Is there anything else I can help with today?”

Conversation Closing: 
- After addressing every query ask the user "Is there anything else I can assist you with?” and if user decline for further assistant than thank the user with “Thank you for contacting ABC Consultancy. We look forward to assisting you further. Have a great day! Goodbye.”
/Conversation Closing

Tone & Style: 
- Always maintain a friendly, conversational tone with empathy and enthusiasm. Ensure responses are concise and clear.
- Pronounce 24/7 as "twenty four by seven" instead of "twenty four slash seven".
- Pronounce times like "7:00 pm" as "seven pm" instead of "seven zero zero pm", 2.0 am as " Two am " instead of "two point zero a m" and "12:30 AM" as "twelve thirty AM".
- Pronounce numbers like 722 as "Seven hundred twenty two" instead of "seven double-two"
- Pronounce contact number like 1234456789 as " one two three double four five six seven eight nine".
/Tone & Style

Clarifications: 
- If the user’s response is unclear, ask: “It seems like you were saying something; could you please complete your query?”
/Clarifications

Non-Repetitive Responses: 
- Avoid repeating the same phrases and address only one query at a time.
/Non-Repetitive Responses

Additional Instructions:
- Ensure that each response generated is unique and doesn't repeat the phrasing or content of previous responses.
- Avoid Using Fillers: Ensure responses are concise and avoid using fillers.
- Ensure that the system accurately recognizes and records the actual date, day and time when a user books an appointment.
- Consistency in Responses: Always provide the same response for the same query to maintain consistency and reliability.
- Emphasize Natural Speech: Utilize casual language, contractions, and natural phrasing. Ensure empathy and friendly tone throughout. Break down complex sentences into simpler ones for clarity and brevity. Introduce synonyms and varied phrases to avoid repetition. Incorporate user data and context for personalized interactions. Add encouraging language, feedback acknowledgment, and motivational prompts to keep users engaged.
- Handle Out-of-Scope Queries: If a user responds with something outside the given parameters, handle it correctly on your own. After processing their out-of-scope query, ask for confirmation if there is anything else and if they need assistance, go ahead with further queries.

/Additional Instructions`;
const VOICE = "alloy";
const PORT = process.env.PORT || 5050; // Allow dynamic port assignment

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
  reply.send({ message: "Twilio Media Stream Server is running!" });
});

// Route for Twilio to handle incoming calls
// <Say> punctuation to improve text-to-speech translation
fastify.all("/incoming-call", async (request, reply) => {
  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
                          <Response>
                              <Say>Please wait while we connect your call to the A. I. voice assistant, powered by Twilio and the Open-A.I. Realtime API</Say>
                              <Pause length="1"/>
                              <Say>O.K. you can start talking!</Say>
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
      "Use this function to check the availability of slots to book for an appointment for Job Roles",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    type: "function",
    name: "book_slots",
    description: "Use this function to book an appointment for Job Roles.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the person" },
        contact_number: {
          type: "string",
          description: "Contact number of the person",
        },
        email: { type: "string", description: "Email of the person" },
        job_role: {
          type: "string",
          description: "Job role for the appointment",
        },
        time: {
          type: "string",
          description: "Time for the appointment, e.g., '12:00 PM'",
        },
        date: {
          type: "string",
          description: "Date for the appointment, e.g., '2024-11-02'",
        },
      },
      required: ["name", "contact_number", "email", "job_role", "time", "date"],
    },
  },
];

const functions = {
  calculate_sum: (args) => args.a + args.b,

  get_current_time: () => {
    const currentTimeIST = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
    });
    return { currentTime: currentTimeIST };
  },

  check_available_slots: async (args) => {
    const { date, time } = args;
    try {
      const availableSlot = await Slot.findOne({ date, time, isBooked: false });
      if (availableSlot) {
        return {
          available: true,
          slot: availableSlot,
          message: "Slot is available.",
        };
      } else {
        return {
          available: false,
          message: "Slot is not available or already booked.",
        };
      }
    } catch (error) {
      console.error("Error checking slot availability:", error);
      return { error: "Error checking slot availability" };
    }
  },

  book_slot: async (args) => {
    const { slotId } = args;
    try {
      const slot = await Slot.findOne({ _id: slotId, isBooked: false });
      if (slot) {
        slot.isBooked = true;
        await slot.save();
        return { success: true, message: "Slot booked successfully." };
      } else {
        return {
          success: false,
          message: "Slot not available or already booked.",
        };
      }
    } catch (error) {
      console.error("Error booking slot:", error);
      return { error: "Error booking slot" };
    }
  },
};

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
              text: 'Hello, thank you for joining ABC Consultancy today! Could I please have your full name?"',
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

        //   console.log(`Received event: ${response.type}`, response);

if (response.type === "response.function_call_arguments.done") {
  const function_name = response.name;
  let function_arguments = JSON.parse(response.arguments);
  console.log("Function Arguments", function_arguments);



  // Define webhook URLs based on function name
  let webhookUrl = "";
  if (function_name === "calculate_sum") {
    webhookUrl = "https://hook.eu2.make.com/your-sum-webhook-id";
  } else if (function_name === "get_current_time") {
    webhookUrl = "https://hook.eu2.make.com/8tp1a8a9llm47s21n8aorbuwqrz1s6ge";
  } else if (function_name === "check_availability") {
    webhookUrl = "https://hook.eu2.make.com/s3g6xd5x5jxp5tiyad0d99dmqdwbmyyv";
  } else if (function_name === "book_slots") {
    webhookUrl = "https://hook.eu2.make.com/98wsus3ynvh3r4qgq3evjwli77nsgiqc";
    // Convert 'start' to a Date object based on provided 'date' and 'time'
    const startDateTime = new Date(
      `${function_arguments.date} ${function_arguments.time}`
    );

    if (isNaN(startDateTime.getTime())) {
      console.error("Invalid start date format");
    } else {
      // Set 'end' to 30 minutes after 'start'
      const endDateTime = new Date(startDateTime.getTime() + 30 * 60000);

      // Format 'Start Date' and 'End Date' as "October 22, 2024 11:30 PM"
      function_arguments.start = startDateTime;
      function_arguments.end = endDateTime;
    }

    // Additional event details
    // function_arguments.summary = "Appointment with Nilesh";
    // function_arguments.event = "Appointment with Nilesh";
    // function_arguments.calendar = "domusny74@gmail.com";
    // function_arguments.duration = "00:30";
    // function_arguments.visibility = "default";
    // function_arguments.allDayEvent = false;
    // function_arguments.transparency = "opaque";
    // function_arguments.conferenceDate = false;

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
      if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
      console.log("Client disconnected.");
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
