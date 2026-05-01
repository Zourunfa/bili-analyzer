## ADDED Requirements

### Requirement: System provides built-in output templates for common publishing scenarios
The system SHALL provide at least three built-in templates: `ppt-outline`, `wechat-article`, and `xiaohongshu-post`.

#### Scenario: List available templates
- **WHEN** user opens template panel from analyze page
- **THEN** system returns built-in template list with id, name, and output format description

### Requirement: Template generation uses analyzed content as primary context
The system SHALL generate template output from video summary and subtitle context, and MUST return stream output for long content.

#### Scenario: Generate with selected template
- **WHEN** user selects template and clicks generate
- **THEN** system streams generated text incrementally and marks completion status at end

#### Scenario: Input validation before generation
- **WHEN** summary/subtitle context is missing
- **THEN** system returns error indicating required context is incomplete

### Requirement: Generated result can be copied and reused immediately
The system SHALL provide one-click copy behavior and keep the latest generated result in session state.

#### Scenario: Copy generated template output
- **WHEN** generation is complete and user clicks copy
- **THEN** system copies full output to clipboard and shows success feedback

