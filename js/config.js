/* PromptCoach settings — the parts you are most likely to edit.
   Loaded before app.js, so app.js can use these values. */

/* The topics the coach must cover. id = internal name (keep it unique),
   label = name shown in the blueprint, hint = what the coach should find out. */
const DEFAULT_TOPICS=[
 {id:"idea",label:"The website",hint:"What is the website for, who is behind it, and what should it help with?"},
 {id:"users",label:"Visitors",hint:"Who will visit the site, and what is each kind of visitor looking for?"},
 {id:"features",label:"What visitors can do",hint:"What should visitors be able to do on the site, like contact you, book a time, sign up or buy? Which are must-haves?"},
 {id:"flow",label:"A visitor's path",hint:"Walk me through a typical visit, step by step, from arriving on the site to reaching the goal."},
 {id:"screens",label:"Pages",hint:"Which pages should the site have, which belong in the main menu, and what goes on each one, from top to bottom?"},
 {id:"data",label:"Information shown or collected",hint:"What information does the site show or collect, like opening hours, prices, or the fields in a contact form?"},
 {id:"look",label:"Look and feel",hint:"How should it look and feel? Any colours, logo, mood or websites you like the style of?"},
 {id:"platform",label:"Practical details",hint:"Which languages should it be in? Anything it must have or must not have, like logins, payments or a blog?"},
 {id:"success",label:"How you'll know it works",hint:"How will you check the finished website is right? What should definitely work?"}
];

/* Clickable example ideas shown under the coach's first message. */
const EXAMPLES=["A website for my hair salon with online booking","A portfolio site for my photography","A site for our local football club"];

/* The coach's first message. \n = new line. */
const WELCOME="Hi, I'm your PromptCoach. I'll ask you a few questions, one at a time, and build a blueprint of your website on the right as we go. When it's complete, I'll turn it into a clear prompt you can paste into a vibe-coding tool like Lovable or Bolt.\n\nTo start: what website would you like, and what should it help you or your visitors with?";
