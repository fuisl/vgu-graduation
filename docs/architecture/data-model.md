# Initial Data Model
Core concepts:
- `User`: internal graduate/admin.
- `Guest`: external invited person.
- `Invitation`: personalized pass with high-entropy bearer token; store a hash where practical.
- `InvitationInviter`: many-to-many relation for joint invitations.
- `RSVP`: attendance state.
- `Photo`: original + derivatives, contributor and moderation state.
- `Wish`: message with moderation/display state.
- `TranslationSegment`: timestamped transcript/translation.
Never put sensitive data in public slugs, analytics, client logs or URLs beyond the necessary invitation credential.
