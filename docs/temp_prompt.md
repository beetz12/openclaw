Great, please use /frontend-tester To verify all the changes are working properly and writine additional tests using /e2e-test-suite if needed.

OK please use /multi-agent-brainstorming to Help me come up with a custom plan to implement the following kanban / task system. Please reference /Users/dave/Work/Auto-Claude for an existing kanban / task system.

# Kanban / Task System

Okay perfect. Are there any other features you think we need to add to make our app ready to serve as an actual Virtual workforce? Please use the /multi-agent-brainstorming skill along with perplexity-deep to
research The best features to include and what would make the best user experience for this kind of app in 2026. I was thinking about some kind of kanban board. Initially when the user asks for a task to be
done, It will break the task into sub-tasks, With each subtask on the kanban board.

 /multi-agent-brainstorming what other features do we need to develop for this to be a fully functional virtual workforce that a client can start using? I think one of our core features /
differentiator is a system that dispatches tasks to claude's agent team that can Work together in parallel with inter-agent communication. Has that been implemented? And when we create this agent team, are we
assigning it the proper skills? I want to start by adding all the knowledgework skills anthropic recently released - see /Users/dave/Work/knowledge-work-plugins. Our goal is that now through the CLI or through
the UI we built, I should be able to ask for a specific task, and our app will Automatically assemble an Agent team, and assign each team member with an appropriate skill from the knowledge work plugin to
collaborate on the task. In addition, To really make this app useful, we needed a user friendly onboarding for users. I think the two audiences I want to focus on initially are IT consultancies and ecommerce
businesses So our app will ask the user to choose one of these businesses, And then ask them a series of basic questions and It's the user to provide necessary knowledge / files, assets So that our app can be
truly useful. Finally I want you to brainstorm about the specific tools we need to have that we will be recreating in python so we can use our own claude cli or agent sdk since we're not using openclaw's tools.
But it would be nice if we had a toggle (maybe in .env file) that lets the user choose if he wants to use tools from openclaw or use the local credentials for maximum flexibility.

By the way, for the Agent Team Dispatch System, I don't know if we need to build our own coordination layer since claude's agent teams already has a coordination layer built in. See @docs/agent_team_info.md for more info.
