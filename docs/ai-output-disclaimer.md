# AI Output Disclaimer and Conditions of Use

Effective date: 2026-07-19

This document explains important limits and conditions for using smoketest
("the App"). It is informational and not legal advice. If you do not agree to
these conditions, do not use the App.

## 1. Purpose and scope

- smoketest is an interface for third-party Responses API-compatible
  models — OpenAI, xAI, and any LM Studio or Ollama server you point it at.
- Text, code, tool actions, and search results may be generated or triggered
  by services smoketest does not operate or control.
- You are responsible for reviewing outputs and for any action you take based
  on them.

## 2. How the App works

- For OpenAI and xAI you provide your own API key. smoketest stores it in
  your browser and sends it to same-origin server routes, which forward
  requests to the selected fixed provider endpoint without persisting the
  key server-side. LM Studio and Ollama typically need no key.
- MCP server definitions are stored in your browser. Enabled MCP
  configuration may be sent to OpenAI or xAI so their Responses API can call
  those remote services on the model's behalf.
- Threads, attachments, memories, skills, and settings are stored in your
  browser's `localStorage` only. smoketest has no server-side account,
  session, or database.
- Provider logging, retention, training, moderation, and data handling are
  controlled by the relevant provider (or by you, for a self-hosted LM
  Studio/Ollama server), not by smoketest.

## 3. AI outputs are unreliable

- Outputs may be inaccurate, fabricated, incomplete, biased, or unsuitable
  for your situation.
- Generated code can be wrong, insecure, or destructive if executed. Search
  citations can be misleading or fail to support a claim.
- Independently verify outputs — especially code, before running it — rather
  than trusting them by default.

## 4. No professional, emergency, or safety-critical use

- smoketest is not a substitute for professional security, legal, financial,
  engineering, or other qualified advice, even when a response reads
  confidently.
- Do not use the App for crisis response, life-support, or any context where
  an error could cause injury, death, or substantial harm.
- If you or someone else is in danger or crisis, contact local emergency
  services or an appropriate qualified professional. Do not rely on
  smoketest or any AI model for intervention.

## 5. Not for children

- smoketest is not designed, intended, or directed toward children, and may
  produce content that is inaccurate, disturbing, or otherwise inappropriate
  for minors.
- Children should not use smoketest. Do not provide or promote access to the
  App for children, and do not deploy it in schools, youth programs, or
  other child-directed settings.
- Adults, guardians, administrators, and deployers are solely responsible
  for preventing inappropriate access and for any minor's use of the App.

## 6. Personal responsibility

- Do not submit secrets, confidential material, personal data, or regulated
  information unless you understand and accept how the selected provider may
  transmit and handle it.
- Follow applicable laws, provider terms, intellectual-property rights,
  privacy obligations, and organizational policies.
- Review what you enable before use. Web search, Code Interpreter, file
  search, and MCP servers can disclose data or cause external actions —
  MCP tool calls in particular run with approval set to "never," so only
  add a server you trust.
- You are responsible for your prompts, configured providers and MCP
  servers, selected tools, outputs, tool actions, and downstream use —
  including any code you copy out and run yourself.

## 7. Prohibited and harmful uses

Do not use smoketest to:

- harass, exploit, stalk, manipulate, discriminate against, or impersonate
  another person;
- target children, minors, or vulnerable individuals;
- develop malware, or to attack, disrupt, or gain unauthorized access to
  systems you do not own or have explicit authorization to test;
- encourage self-harm, violence, illegal conduct, or dangerous activity;
- violate privacy, intellectual-property rights, laws, or third-party terms.

## 8. Third-party services

Your use of OpenAI, xAI, a local LM Studio or Ollama server, or any MCP
server you configure is subject to that service's own terms, policies,
availability, pricing, rate limits, and data practices. smoketest does not
control those services and cannot guarantee their behavior, accuracy, or
continued availability.

## 9. Assumption of risk

smoketest is provided as is, without warranties. To the maximum extent
permitted by applicable law, its authors, contributors, and maintainers are
not liable for claims, losses, or damages arising from the App, AI outputs,
tool actions, generated code, configured third-party services, or your
reliance on them. You assume the risks of using the App.

## 10. Acceptance and updates

By using smoketest, you confirm that you have read and accepted these
conditions. This document may change over time; continued use after an
update constitutes acceptance of the revised version.
