import type { LevelId } from "@/store/useUserStore";

export type DiagramType =
  | "Flowchart"
  | "Mind Map"
  | "Concept Map"
  | "ER Diagram"
  | "UML Class"
  | "Sequence"
  | "Process"
  | "Network"
  | "Block Diagram";

export interface GeneratedDiagram {
  id: string;
  prompt: string;
  title: string;
  type: DiagramType;
  code: string;
  explanation: string;
  level: LevelId;
  createdAt: string;
}

export type PptTheme = "Indigo Modern" | "Clean White" | "Dark Elegant" | "Playful";
export interface DeckSlide {
  id: string;
  title: string;
  bullets: string[];
  notes: string;
  kind: "title" | "content" | "quiz" | "conclusion";
  diagram?: string | undefined;
}
export interface GeneratedDeck {
  id: string;
  topic: string;
  level: LevelId;
  theme: PptTheme;
  slides: DeckSlide[];
  createdAt: string;
  speakerNotes: boolean;
}

const examples: { match: RegExp; type?: DiagramType; title: string; code: string }[] = [
  {
    match: /even|odd/i,
    type: "Flowchart",
    title: "Even or odd number",
    code: `flowchart TD
    A([Start]) --> B[/Enter a number/]
    B --> C{number % 2 == 0?}
    C -->|Yes| D[Even]
    C -->|No| E[Odd]
    D --> F([End])
    E --> F`,
  },
  {
    match: /water cycle/i,
    type: "Process",
    title: "The water cycle",
    code: `flowchart LR
    A[Sun] --> B[Evaporation]
    B --> C[Clouds]
    C --> D[Condensation]
    D --> E[Rainfall]
    E --> F[Collection]
    F --> B`,
  },
  {
    match: /sdlc|software development life cycle/i,
    title: "Software development life cycle",
    code: `flowchart LR
    A([Requirements]) --> B[Design]
    B --> C[Development]
    C --> D[Testing]
    D --> E[Deployment]
    E --> F[Maintenance]`,
  },
  {
    match: /oop|object.oriented/i,
    type: "Mind Map",
    title: "Object-oriented programming",
    code: `mindmap
  root((OOP))
    Encapsulation
      Data hiding
      Bundled methods
    Inheritance
      Reuse
      Class hierarchies
    Polymorphism
      Overriding
      Many forms
    Abstraction
      Essential features
      Simple interfaces`,
  },
  {
    match: /library|er diagram/i,
    type: "ER Diagram",
    title: "Library system",
    code: `erDiagram
    MEMBER ||--o{ LOAN : borrows
    BOOK ||--o{ LOAN : includes
    MEMBER {
      int member_id PK
      string name
    }
    BOOK {
      int book_id PK
      string title
    }
    LOAN {
      int loan_id PK
      date due_date
    }`,
  },
];

export function explanationFor(title: string, level: LevelId) {
  if (level === "c1-5")
    return `${title} is shown as a picture made from simple shapes and arrows. Follow the arrows to see what happens next.`;
  if (level === "grad")
    return `This ${title.toLowerCase()} model visualises the entities, transitions, and dependencies in the described system. Arrows encode the direction of control or relationship; use the source to adapt its formal notation.`;
  return `This diagram explains ${title.toLowerCase()} using connected steps and clear labels. Follow each arrow to understand how the ideas relate.`;
}

function ensureFlowchartTerminals(code: string) {
  const rows = code.split("\n");
  const headerIndex = rows.findIndex((line) => /^\s*flowchart\b/.test(line));
  if (headerIndex < 0) return code;
  const body = rows.slice(headerIndex + 1);
  const firstNode = body
    .map((line) => /^\s*([A-Za-z]\w*)\s*(?:\[|\(|\{)/.exec(line)?.[1])
    .find(Boolean);
  if (firstNode && !/\(\[Start\]\)/i.test(code)) rows.push(`    START([Start]) --> ${firstNode}`);
  const lastEdge = [...body]
    .reverse()
    .map((line) => /-->\s*([A-Za-z]\w*)/.exec(line)?.[1])
    .find(Boolean);
  if (lastEdge && !/\(\[End\]\)/i.test(code)) rows.push(`    ${lastEdge} --> FINISH([End])`);
  return rows.join("\n");
}

export function generateDiagramMock(
  prompt: string,
  requestedType: DiagramType,
  level: LevelId,
  forceFlowchart = false,
  forceMindMap = false,
): GeneratedDiagram {
  const match = examples.find((item) => item.match.test(prompt));
  const found =
    (forceFlowchart && match && !match.code.startsWith("flowchart")) ||
    (forceMindMap && match && !match.code.startsWith("mindmap"))
      ? undefined
      : match;
  const type = forceFlowchart
    ? "Flowchart"
    : forceMindMap
      ? "Mind Map"
      : (found?.type ?? requestedType);
  const title = found?.title ?? (prompt.trim().slice(0, 64) || "Concept overview");
  let code = found?.code;
  if (!code && type === "Mind Map") {
    code = `mindmap
  root((${title.replace(/[()]/g, "")}))
    Key ideas
      Definition
      Examples
    Connections
      Causes
      Effects
    Applications
      Practice
      Review`;
  }
  if (!code && type === "ER Diagram") {
    code = `erDiagram
    STUDENT ||--o{ ENROLLMENT : joins
    COURSE ||--o{ ENROLLMENT : contains
    STUDENT {
      int student_id PK
      string name
    }
    COURSE {
      int course_id PK
      string title
    }
    ENROLLMENT {
      int enrollment_id PK
      date enrolled_on
    }`;
  }
  if (!code && type === "UML Class") {
    code = `classDiagram
    class Person {
      +String name
      +learn()
    }
    class Student {
      +String grade
      +study()
    }
    Person <|-- Student`;
  }
  if (!code && type === "Sequence") {
    code = `sequenceDiagram
    actor User
    participant App
    participant System
    User->>App: Request ${title}
    App->>System: Process request
    System-->>App: Return result
    App-->>User: Show result`;
  }
  if (!code && type === "Concept Map") {
    code = `graph TD
    A[${title}] --> B[Key ideas]
    A --> C[Examples]
    A --> D[Applications]
    B --> E[Build understanding]
    C --> E
    D --> E`;
  }
  if (!code && type === "Block Diagram") {
    code = `block-beta
    columns 3
    A["Input"] space:1 B["${title}"]
    A --> B
    B --> C["Output"]`;
  }
  if (!code && type === "Network") {
    code = `graph LR
    A((Hub)) --- B[${title}]
    A --- C[Node 1]
    A --- D[Node 2]
    C --- D`;
  }
  if (!code && (type === "Process" || type === "Flowchart")) {
    code = `flowchart LR
    A([Start]) --> B[${title}]
    B --> C[Main step]
    C --> D([End])`;
  }
  code ??= `flowchart TD
    A([Start]) --> B[${title.replaceAll("[", "").replaceAll("]", "").replaceAll("(", "").replaceAll(")", "")}]
    B --> C[Explore the key ideas]
    C --> D[Apply what you learned]
    D --> E([End])`;
  if (type === "Flowchart") code = ensureFlowchartTerminals(code);
  return {
    id: `diagram-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    prompt,
    title,
    type,
    code,
    explanation: explanationFor(title, level),
    level,
    createdAt: new Date().toISOString(),
  };
}

export function refineDiagramMock(
  current: GeneratedDiagram,
  instruction: string,
  level: LevelId,
): GeneratedDiagram {
  const request = instruction.toLowerCase();
  const updated = { ...current, id: `diagram-${Date.now()}`, createdAt: new Date().toISOString() };
  if (request.includes("simpl")) {
    updated.code = current.code
      .split("\n")
      .filter((line) => !/child|example|detail|application/i.test(line))
      .join("\n");
  } else if (/detail|expand|example/.test(request)) {
    updated.code = current.code.replace(/(\s+[A-Z]\[[^\]]+\])$/, "$1\n    Z[Real-world example]");
  } else if (instruction.trim()) {
    updated.prompt = `${current.prompt} — ${instruction.trim()}`;
  }
  updated.explanation = explanationFor(updated.title, level);
  return updated;
}

const aiSlides: [string, string[]][] = [
  [
    "What is AI?",
    [
      "AI enables machines to perform tasks that usually need human intelligence.",
      "It uses data, rules, and algorithms to find useful patterns.",
    ],
  ],
  [
    "How AI works",
    [
      "Data is collected and prepared.",
      "A model learns patterns during training.",
      "The trained model uses those patterns to make predictions.",
    ],
  ],
  [
    "Types of AI",
    [
      "Narrow AI is designed for a specific task.",
      "General AI would learn and reason across many tasks.",
      "Today's everyday systems are examples of Narrow AI.",
    ],
  ],
  [
    "Applications",
    [
      "Healthcare tools can help analyse medical images.",
      "Maps estimate routes and travel times.",
      "Learning apps adapt practice to each student.",
    ],
  ],
  [
    "Advantages",
    [
      "AI can process large amounts of information quickly.",
      "It can automate repetitive tasks.",
      "It can support people with useful recommendations.",
    ],
  ],
  [
    "Disadvantages",
    [
      "Biased data can lead to unfair results.",
      "Some systems can be difficult to explain.",
      "People must protect privacy and check important decisions.",
    ],
  ],
  [
    "AI in daily life",
    [
      "Voice assistants respond to spoken requests.",
      "Email services filter unwanted messages.",
      "Streaming apps suggest content based on your choices.",
    ],
  ],
  [
    "Future of AI",
    [
      "Responsible design will become increasingly important.",
      "People and AI can work together on complex challenges.",
      "Learning how AI works helps us use it wisely.",
    ],
  ],
];

function makeSlide(
  title: string,
  bullets: string[],
  kind: DeckSlide["kind"],
  notes: string,
  id: string,
  diagram?: string,
): DeckSlide {
  return { id, title, bullets, kind, notes, ...(diagram ? { diagram } : {}) };
}

export function generateDeckMock(
  topic: string,
  level: LevelId,
  slideCount: number,
  theme: PptTheme,
  speakerNotes: boolean,
  includeDiagrams: boolean,
  includeQuiz: boolean,
  extra: string,
): GeneratedDeck {
  const aiTopic = /artificial intelligence|\bai\b/i.test(topic);
  const digestive = /digestive/i.test(topic);
  const title = topic.trim() || "Study topic";
  const slides: DeckSlide[] = [
    makeSlide(
      title,
      [`A clear, level-friendly guide to ${title}`, "Key ideas, examples, and a quick review"],
      "title",
      `Introduce ${title} and explain what the audience will learn. ${extra}`.trim(),
      "s1",
    ),
  ];
  const body: [string, string[]][] = aiTopic
    ? aiSlides
    : [
        [
          `What is ${title}?`,
          [
            `${title} is an important topic to understand.`,
            "Start with its main definition and purpose.",
            "Connect new vocabulary to familiar examples.",
          ],
        ],
        [
          "Key ideas",
          [
            "Break the topic into a few smaller parts.",
            "Look for patterns and relationships.",
            "Use examples to check your understanding.",
          ],
        ],
        [
          "How it works",
          [
            "Identify the starting point.",
            "Follow each step in order.",
            "Notice how one part affects the next.",
          ],
        ],
        [
          "Examples and applications",
          [
            "Connect the idea to everyday life.",
            "Compare examples to see what stays the same.",
            "Explain why each example fits.",
          ],
        ],
        [
          "Why it matters",
          [
            "The concept helps explain real-world observations.",
            "It supports further learning.",
            "Careful reasoning makes the idea easier to apply.",
          ],
        ],
        [
          "A closer look",
          [
            "Review the key terms.",
            "Describe a useful example.",
            "Check your understanding with a partner.",
          ],
        ],
        [
          "Quick recap",
          [
            "Remember the central idea.",
            "Use the examples to explain the details.",
            "Ask questions about anything unclear.",
          ],
        ],
        [
          "What comes next?",
          [
            "Build on the concepts in this presentation.",
            "Practise explaining the topic in your own words.",
            "Explore a new example.",
          ],
        ],
      ];
  if (digestive)
    body[2] = [
      "The digestive journey",
      [
        "Food moves through the digestive tract in sequence.",
        "Each organ helps break food down or absorb nutrients.",
      ],
    ];
  const available = Math.max(1, slideCount - 2 - (includeQuiz ? 1 : 0));
  for (let i = 0; i < available; i++) {
    const [slideTitle, bullets] = body[i % body.length]!;
    const diagram =
      digestive && includeDiagrams && i === 2
        ? `flowchart LR
    A[Mouth] --> B[Oesophagus]
    B --> C[Stomach]
    C --> D[Small Intestine]
    D --> E[Large Intestine]
    E --> F[Rectum]`
        : undefined;
    slides.push(
      makeSlide(
        slideTitle,
        bullets,
        "content",
        `Explain ${slideTitle.toLowerCase()} with a concrete example. Encourage questions from the audience.`,
        `s${slides.length + 1}`,
        diagram,
      ),
    );
  }
  if (includeQuiz)
    slides.push(
      makeSlide(
        "Quick quiz",
        [
          `Which idea best describes ${title}?`,
          "Share your answer and explain your reasoning.",
          "Discuss the answer together.",
        ],
        "quiz",
        `Ask the audience to answer the question about ${title}.`,
        `s${slides.length + 1}`,
      ),
    );
  slides.push(
    makeSlide(
      "Conclusion",
      [
        `Remember the key ideas about ${title}.`,
        "Use examples to explain what you learned.",
        "Thank you — questions?",
      ],
      "conclusion",
      `Summarise the main takeaways about ${title}.`,
      `s${slides.length + 1}`,
    ),
  );
  return {
    id: `deck-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    topic: title,
    level,
    theme,
    slides: slides.slice(0, slideCount).map((slide) => ({
      ...slide,
      notes: speakerNotes ? slide.notes : "",
    })),
    createdAt: new Date().toISOString(),
    speakerNotes,
  };
}
