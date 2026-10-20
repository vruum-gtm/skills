# Vruum connection tool map

Use the authenticated workspace and only workspace selectors in the advertised schema. Resolve ambiguous scope through available membership/profile reads before acting. Compound tool selectors describe each operation.

Use the published input schema. Workflow notation expresses intent; call only the matching advertised operation. Bind fixed selectors, including nested payload decisions, exactly as the schema requires. Omit fields absent from that schema; keep a declared constant when required. Remaining arguments and response contracts are unchanged. Never construct a generic executor or REST bypass.

Reads and previews can consume provider work where disclosed by the tool. Existing permission, approval, billing and spending policies still apply. Inspect all batch outcomes. After uncertain writes inspect records/jobs before retrying; do not repeat successes.

| Workflow operation | Callable tool | Fixed payload selectors |
| --- | --- | --- |
| fetch type="account_brief" | `fetch` | None |
| fetch type="account_state" | `fetch` | None |
| fetch type="action" | `fetch` | None |
| fetch type="actions_inbox" | `fetch` | None |
| fetch subtype="attribution" type="ads" | `fetch` | None |
| fetch subtype="campaign" type="ads" | `fetch` | None |
| fetch subtype="creative" type="ads" | `fetch` | None |
| fetch subtype="targeting_entities" type="ads" | `fetch` | None |
| fetch type="asset" | `fetch` | None |
| fetch type="attention_portfolio" | `fetch` | None |
| fetch type="billing" | `fetch` | None |
| fetch type="bowtie" | `fetch` | None |
| fetch type="buyer_inquiry" | `fetch` | None |
| fetch type="claim" | `fetch` | None |
| fetch type="company_family" | `fetch` | None |
| fetch type="company_research" | `fetch` | None |
| fetch type="company_resolution_queue" | `fetch` | None |
| fetch type="conversation" | `fetch` | None |
| fetch type="conversation_commitments" | `fetch` | None |
| fetch type="conversation_history" | `fetch` | None |
| fetch type="conversation_meetings" | `fetch` | None |
| fetch type="conversation_reply_plan" | `fetch` | None |
| fetch type="csv_import" | `fetch` | None |
| fetch type="customer_impact" | `fetch` | None |
| fetch type="deal" | `fetch` | None |
| fetch type="deal_alerts" | `fetch` | None |
| fetch type="deal_pipelines" | `fetch` | None |
| fetch type="experiment" | `fetch` | None |
| fetch type="experiment_assignments" | `fetch` | None |
| fetch type="experiments" | `fetch` | None |
| fetch type="growth_formula" | `fetch` | None |
| fetch type="history_import" | `fetch` | None |
| fetch type="history_import_batches" | `fetch` | None |
| fetch type="history_import_people" | `fetch` | None |
| fetch type="history_import_preview" | `fetch` | None |
| fetch type="history_import_setup" | `fetch` | None |
| fetch type="history_imports" | `fetch` | None |
| fetch subtype="benchmarks" type="insights" | `fetch` | None |
| fetch subtype="improve" type="insights" | `fetch` | None |
| fetch subtype="pattern_tags" type="insights" | `fetch` | None |
| fetch subtype="prompts" type="insights" | `fetch` | None |
| fetch subtype="quality" type="insights" | `fetch` | None |
| fetch subtype="reply_diagnosis" type="insights" | `fetch` | None |
| fetch type="job" | `fetch` | None |
| fetch type="journey_comparison" | `fetch` | None |
| fetch subtype="activity" type="marketing" | `fetch` | None |
| fetch subtype="content_reply" type="marketing" | `fetch` | None |
| fetch subtype="content_response" type="marketing" | `fetch` | None |
| fetch subtype="objective_content" type="marketing" | `fetch` | None |
| fetch subtype="overview" type="marketing" | `fetch` | None |
| fetch type="measurement_projects" | `fetch` | None |
| fetch type="motion_economics" | `fetch` | None |
| fetch type="motions" | `fetch` | None |
| fetch type="objective" | `fetch` | None |
| fetch type="objective_measurement" | `fetch` | None |
| fetch type="objective_workspace" | `fetch` | None |
| fetch type="offer_publication" | `fetch` | None |
| fetch type="person_history_imports" | `fetch` | None |
| fetch type="person_research" | `fetch` | None |
| fetch type="plan" | `fetch` | None |
| fetch type="post_analytics" | `fetch` | None |
| fetch type="publish_readiness" | `fetch` | None |
| fetch type="relationship_attempt" | `fetch` | None |
| fetch subtype="accounts" type="relationship_history" | `fetch` | None |
| fetch subtype="accounts" type="relationship_history_detail" | `fetch` | None |
| fetch subtype="people" type="relationship_history_detail" | `fetch` | None |
| fetch subtype="people" type="relationship_history" | `fetch` | None |
| fetch type="research_answers" | `fetch` | None |
| fetch type="research_playbook" | `fetch` | None |
| fetch type="research_run" | `fetch` | None |
| fetch type="research_sources" | `fetch` | None |
| fetch type="research_work" | `fetch` | None |
| fetch type="research_work_list" | `fetch` | None |
| fetch type="retention" | `fetch` | None |
| fetch subtype="bowtie" type="scoreboard" | `fetch` | None |
| fetch subtype="impact" type="scoreboard" | `fetch` | None |
| fetch type="search_visibility" | `fetch` | None |
| fetch type="seller_signals" | `fetch` | None |
| fetch subtype="ai_compute" type="settings" | `fetch` | None |
| fetch subtype="automation" type="settings" | `fetch` | None |
| fetch subtype="booking_link" type="settings" | `fetch` | None |
| fetch subtype="channel_status" type="settings" | `fetch` | None |
| fetch subtype="marketing" type="settings" | `fetch` | None |
| fetch subtype="objective_delegations" type="settings" | `fetch` | None |
| fetch subtype="profile" type="settings" | `fetch` | None |
| fetch subtype="record_views" type="settings" | `fetch` | None |
| fetch type="skill" | `fetch` | None |
| fetch subtype="outreach" type="stats" | `fetch` | None |
| fetch subtype="person" type="stats" | `fetch` | None |
| fetch subtype="plan" type="stats" | `fetch` | None |
| fetch subtype="prose" type="stats" | `fetch` | None |
| fetch type="unit_economics" | `fetch` | None |
| fetch type="web_source" | `fetch` | None |
| find_warm_path  | `find_warm_path` | None |
| get_content_review  | `get_content_review` | None |
| get_daily_briefing  | `get_daily_briefing` | None |
| get_deal_360  | `get_deal_360` | None |
| get_engagement_review  | `get_engagement_review` | None |
| get_network_identity_review  | `get_network_identity_review` | None |
| get_next_actions  | `get_next_actions` | None |
| get_objective_outcomes  | `get_objective_outcomes` | None |
| get_outreach_review  | `get_outreach_review` | None |
| get_performance_metrics view="both" | `get_performance_metrics` | None |
| get_performance_metrics view="connections" | `get_performance_metrics` | None |
| get_performance_metrics view="funnel" | `get_performance_metrics` | None |
| get_performance_metrics view="timeseries" | `get_performance_metrics` | None |
| get_person_360  | `get_person_360` | None |
| get_revenue view="account" | `get_revenue` | None |
| get_revenue view="bindings" | `get_revenue` | None |
| get_revenue view="connection" | `get_revenue` | None |
| get_revenue view="evidence" | `get_revenue` | None |
| get_revenue view="finance_workspace" | `get_revenue` | None |
| get_revenue view="metrics" | `get_revenue` | None |
| get_revenue view="service_margin" | `get_revenue` | None |
| import_prospects action="csv_preview" | `import_prospects` | None |
| import_prospects action="csv_start" | `import_prospects` | None |
| import_prospects action="sales_nav_dismiss" | `import_prospects` | None |
| import_prospects action="sales_nav_import" | `import_prospects` | None |
| import_prospects action="sales_nav_preview" | `import_prospects` | None |
| import_prospects action="sales_nav_searches" | `import_prospects` | action="accounts" |
| import_prospects action="sales_nav_searches" | `import_prospects` | action="create" |
| import_prospects action="sales_nav_searches" | `import_prospects` | action="delete" |
| import_prospects action="sales_nav_searches" | `import_prospects` | action="list" |
| import_prospects action="sales_nav_searches" | `import_prospects` | action="register" |
| import_prospects action="sales_nav_searches" | `import_prospects` | action="update" |
| inspect_assistant action="browser_source" | `inspect_assistant` | None |
| inspect_assistant action="job" | `inspect_assistant` | None |
| inspect_assistant action="jobs" | `inspect_assistant` | None |
| inspect_assistant action="list" | `inspect_assistant` | None |
| inspect_assistant action="read" | `inspect_assistant` | None |
| inspect_objective action="objective_agent_context" | `inspect_objective` | None |
| inspect_objective action="objective_agent_options" | `inspect_objective` | None |
| inspect_objective action="objective_agent_runs" | `inspect_objective` | None |
| inspect_objective action="objective_agent_work" | `inspect_objective` | None |
| inspect_objective action="objective_audience" | `inspect_objective` | None |
| inspect_objective action="objective_audience_build" | `inspect_objective` | None |
| inspect_objective action="objective_business" | `inspect_objective` | None |
| inspect_objective action="objective_forecast" | `inspect_objective` | None |
| inspect_objective action="objective_pilot_review" | `inspect_objective` | None |
| inspect_objective action="objective_setup_context" | `inspect_objective` | None |
| inspect_objective action="objective_setup_list" | `inspect_objective` | None |
| inspect_objective action="objective_sourcing_plan" | `inspect_objective` | None |
| inspect_objective action="objective_sourcing_recovery" | `inspect_objective` | None |
| inspect_objective action="objective_sourcing_run" | `inspect_objective` | None |
| inspect_objective action="objective_touch_preview" | `inspect_objective` | None |
| inspect_pipeline  | `inspect_pipeline` | None |
| manage_account action="adopt_directory" | `manage_account` | None |
| manage_account action="buying_roles" | `manage_account` | None |
| manage_account action="confirm_labor" | `manage_account` | None |
| manage_account action="critical_event" | `manage_account` | None |
| manage_account action="critical_event_step" | `manage_account` | decision="accept" |
| manage_account action="critical_event_step" | `manage_account` | decision="complete" |
| manage_account action="critical_event_step" | `manage_account` | decision="confirm" |
| manage_account action="customer_growth_record" | `manage_account` | None |
| manage_account action="customer_growth_review" | `manage_account` | None |
| manage_account action="customer_journey" | `manage_account` | None |
| manage_account action="delete_impact" | `manage_account` | None |
| manage_account action="discovery_create" | `manage_account` | None |
| manage_account action="discovery_fact" | `manage_account` | None |
| manage_account action="discovery_review" | `manage_account` | decision="confirm" |
| manage_account action="discovery_review" | `manage_account` | decision="contradict" |
| manage_account action="discovery_review" | `manage_account` | decision="withdraw" |
| manage_account action="impact_promise" | `manage_account` | None |
| manage_account action="impact_report" | `manage_account` | None |
| manage_account action="impact_verify" | `manage_account` | None |
| manage_account action="journey_measurement_fact" | `manage_account` | None |
| manage_account action="kickoff_plan" | `manage_account` | None |
| manage_account action="list" | `manage_account` | action="archive" |
| manage_account action="list" | `manage_account` | action="create" |
| manage_account action="list_members" | `manage_account` | action="add" |
| manage_account action="list_members" | `manage_account` | action="remove" |
| manage_account action="list" | `manage_account` | action="rename" |
| manage_account action="list" | `manage_account` | action="unarchive" |
| manage_account action="note" | `manage_account` | None |
| manage_account action="objective_expansion" | `manage_account` | mode="resolve_prerequisites" |
| manage_account action="objective_expansion" | `manage_account` | mode="open_deal" |
| manage_account action="parent" | `manage_account` | None |
| manage_account action="record_impact" | `manage_account` | None |
| manage_account action="record_labor" | `manage_account` | None |
| manage_account action="renewal_review" | `manage_account` | None |
| manage_account action="state" | `manage_account` | None |
| manage_account action="task" | `manage_account` | None |
| manage_assistant action="append_message" | `manage_assistant` | None |
| manage_assistant action="decide_card" | `manage_assistant` | decision="approved" |
| manage_assistant action="decide_card" | `manage_assistant` | decision="declined" |
| manage_assistant action="job_control" | `manage_assistant` | command="pause" |
| manage_assistant action="job_control" | `manage_assistant` | command="resume" |
| manage_assistant action="job_control" | `manage_assistant` | command="cancel" |
| manage_assistant action="job_control" | `manage_assistant` | command="steer" |
| manage_assistant action="job_control" | `manage_assistant` | command="takeover" |
| manage_assistant action="job_control" | `manage_assistant` | command="stop_period" |
| manage_assistant action="job_start" | `manage_assistant` | None |
| manage_assistant action="rate" | `manage_assistant` | None |
| manage_assistant action="start_conversation" | `manage_assistant` | None |
| manage_assistant action="undo" | `manage_assistant` | None |
| manage_content action="authorize_author" kind="ad" | `manage_content` | None |
| manage_content action="boost" kind="ad" | `manage_content` | None |
| manage_content action="pause" kind="ad" | `manage_content` | None |
| manage_content action="reject" kind="ad" | `manage_content` | None |
| manage_content action="revoke_author" kind="ad" | `manage_content` | None |
| manage_content action="set_page" kind="ad" | `manage_content` | None |
| manage_content action="store_creative" kind="ad" | `manage_content` | None |
| manage_content action="delete" kind="content" | `manage_content` | None |
| manage_content action="draft" kind="content" | `manage_content` | None |
| manage_content action="draft_post" kind="content" | `manage_content` | None |
| manage_content action="edit" kind="content" | `manage_content` | None |
| manage_content action="publish" kind="content" | `manage_content` | None |
| manage_content action="schedule" kind="content" | `manage_content` | None |
| manage_content action="decide" kind="objective_content" | `manage_content` | decision="publish" |
| manage_content action="decide" kind="objective_content" | `manage_content` | decision="reject" |
| manage_content action="decide" kind="objective_content" | `manage_content` | decision="schedule" |
| manage_content action="draft" kind="objective_content" | `manage_content` | None |
| manage_content action="handoff" kind="objective_content" | `manage_content` | None |
| manage_content action="prepare" kind="objective_content" | `manage_content` | None |
| manage_content action="reply_decide" kind="objective_content" | `manage_content` | None |
| manage_content action="reply_prepare" kind="objective_content" | `manage_content` | None |
| manage_content action="response_draft" kind="objective_content" | `manage_content` | None |
| manage_content action="response_prepare" kind="objective_content" | `manage_content` | None |
| manage_deal action="advance" | `manage_deal` | None |
| manage_deal action="archive_pipeline" | `manage_deal` | None |
| manage_deal action="archive_stage" | `manage_deal` | None |
| manage_deal action="create" | `manage_deal` | None |
| manage_deal action="create_pipeline" | `manage_deal` | None |
| manage_deal action="create_stage" | `manage_deal` | None |
| manage_deal action="handoff" | `manage_deal` | decision="accept" |
| manage_deal action="handoff" | `manage_deal` | decision="propose" |
| manage_deal action="handoff" | `manage_deal` | decision="return" |
| manage_deal action="handoff" | `manage_deal` | decision="withdraw" |
| manage_deal action="impact_commitment" | `manage_deal` | None |
| manage_deal action="lost" | `manage_deal` | None |
| manage_deal action="meeting_outcome" | `manage_deal` | None |
| manage_deal action="note" | `manage_deal` | None |
| manage_deal action="offer_correction" | `manage_deal` | None |
| manage_deal action="offer_correction_accept" | `manage_deal` | None |
| manage_deal action="offer_correction_reject" | `manage_deal` | None |
| manage_deal action="qualify" | `manage_deal` | None |
| manage_deal action="rename_pipeline" | `manage_deal` | None |
| manage_deal action="reopen" | `manage_deal` | None |
| manage_deal action="reorder_pipelines" | `manage_deal` | None |
| manage_deal action="reorder_stages" | `manage_deal` | None |
| manage_deal action="set_default" | `manage_deal` | None |
| manage_deal action="stage" | `manage_deal` | None |
| manage_deal action="stage_policy" | `manage_deal` | None |
| manage_deal action="stakeholders" | `manage_deal` | action="add" |
| manage_deal action="stakeholders" | `manage_deal` | action="list" |
| manage_deal action="stakeholders" | `manage_deal` | action="remove" |
| manage_deal action="stakeholders" | `manage_deal` | action="update" |
| manage_deal action="stalled" | `manage_deal` | None |
| manage_deal action="task" | `manage_deal` | None |
| manage_deal action="unarchive_pipeline" | `manage_deal` | None |
| manage_deal action="unarchive_stage" | `manage_deal` | None |
| manage_deal action="update" | `manage_deal` | None |
| manage_deal action="update_stage" | `manage_deal` | None |
| manage_deal action="won" | `manage_deal` | None |
| manage_deal action="won_review" | `manage_deal` | decision="confirm" |
| manage_deal action="won_review" | `manage_deal` | decision="contradict" |
| manage_deal action="won_review" | `manage_deal` | decision="withdraw" |
| manage_engagements action="approve" | `manage_engagements` | None |
| manage_engagements action="draft_comment" | `manage_engagements` | None |
| manage_engagements action="edit" | `manage_engagements` | None |
| manage_engagements action="engager_actioned" | `manage_engagements` | None |
| manage_engagements action="engager_dismissed" | `manage_engagements` | None |
| manage_engagements action="engager_reopened" | `manage_engagements` | None |
| manage_engagements action="skip" | `manage_engagements` | None |
| manage_history_import action="approve" | `manage_history_import` | None |
| manage_history_import action="pause" | `manage_history_import` | None |
| manage_history_import action="propose" | `manage_history_import` | None |
| manage_history_import action="remove" | `manage_history_import` | None |
| manage_history_import action="resume" | `manage_history_import` | None |
| manage_history_import action="stop" | `manage_history_import` | None |
| manage_kb action="delete" | `manage_kb` | None |
| manage_kb action="reindex" | `manage_kb` | None |
| manage_kb action="upsert" | `manage_kb` | None |
| manage_messages action="approve" | `manage_messages` | None |
| manage_messages action="asset_approve" | `manage_messages` | None |
| manage_messages action="asset_create" | `manage_messages` | None |
| manage_messages action="asset_revoke" | `manage_messages` | None |
| manage_messages action="asset_update" | `manage_messages` | None |
| manage_messages action="backfill_external_sends" | `manage_messages` | None |
| manage_messages action="commitment_followup" | `manage_messages` | decision="assign" |
| manage_messages action="commitment_followup" | `manage_messages` | decision="close" |
| manage_messages action="commitment_followup" | `manage_messages` | decision="stop" |
| manage_messages action="draft_followup" | `manage_messages` | None |
| manage_messages action="draft_reply" | `manage_messages` | None |
| manage_messages action="edit" | `manage_messages` | None |
| manage_messages action="link_commitment_meeting" | `manage_messages` | decision="link" |
| manage_messages action="link_commitment_meeting" | `manage_messages` | decision="unlink" |
| manage_messages action="reconcile_delivery" | `manage_messages` | None |
| manage_messages action="reconcile_external_email" | `manage_messages` | action="apply" |
| manage_messages action="reconcile_external_email" | `manage_messages` | action="exceptions" |
| manage_messages action="reconcile_external_email" | `manage_messages` | action="hold" |
| manage_messages action="reconcile_external_email" | `manage_messages` | action="mark_cancelled" |
| manage_messages action="reconcile_external_email" | `manage_messages` | action="preview" |
| manage_messages action="reconcile_external_email" | `manage_messages` | action="release" |
| manage_messages action="reconcile_external_email" | `manage_messages` | action="rescan" |
| manage_messages action="record_commitment" | `manage_messages` | None |
| manage_messages action="regenerate" | `manage_messages` | None |
| manage_messages action="reject" | `manage_messages` | None |
| manage_messages action="reply_plan_prepare" | `manage_messages` | None |
| manage_messages action="reply_plan_save" | `manage_messages` | None |
| manage_messages action="review_commitment" | `manage_messages` | decision="completed" |
| manage_messages action="review_commitment" | `manage_messages` | decision="reopened" |
| manage_messages action="send" | `manage_messages` | None |
| manage_messages action="send_linkedin" | `manage_messages` | None |
| manage_network_identity_resolution action="classify_mailbox" | `manage_network_identity_resolution` | None |
| manage_network_identity_resolution action="merge_identity" | `manage_network_identity_resolution` | None |
| manage_network_identity_resolution action="merge_people" | `manage_network_identity_resolution` | None |
| manage_network_identity_resolution action="review_people" | `manage_network_identity_resolution` | None |
| manage_network_identity_resolution action="set_affiliation" decision="add" | `manage_network_identity_resolution` | None |
| manage_network_identity_resolution action="set_affiliation" decision="remove" | `manage_network_identity_resolution` | None |
| manage_outreach action="attention_decision" | `manage_outreach` | decision="confirmed" |
| manage_outreach action="attention_decision" | `manage_outreach` | decision="dismissed" |
| manage_outreach action="attention_decision" | `manage_outreach` | decision="not_yet" |
| manage_outreach action="attention_decision" | `manage_outreach` | decision="opened" |
| manage_outreach action="attention_decision" | `manage_outreach` | decision="prepared" |
| manage_outreach action="attention_decision" | `manage_outreach` | decision="saved" |
| manage_outreach action="attention_decision" | `manage_outreach` | decision="undone" |
| manage_outreach action="channels" | `manage_outreach` | None |
| manage_outreach action="experiment_design" | `manage_outreach` | None |
| manage_outreach action="experiment_start" | `manage_outreach` | None |
| manage_outreach action="experiment_stop" | `manage_outreach` | None |
| manage_outreach action="first_impact_setup_accept" | `manage_outreach` | None |
| manage_outreach action="objective_account" | `manage_outreach` | None |
| manage_outreach action="objective_agent_control" | `manage_outreach` | command="start", scope="prepare_business_plan" |
| manage_outreach action="objective_agent_control" | `manage_outreach` | command="start", scope="pursue_meetings" |
| manage_outreach action="objective_agent_control" | `manage_outreach` | command="start", scope="pursue_content" |
| manage_outreach action="objective_agent_control" | `manage_outreach` | command="pause" |
| manage_outreach action="objective_agent_control" | `manage_outreach` | command="resume" |
| manage_outreach action="objective_agent_control" | `manage_outreach` | command="cancel" |
| manage_outreach action="objective_agent_control" | `manage_outreach` | command="steer" |
| manage_outreach action="objective_agent_control" | `manage_outreach` | command="takeover" |
| manage_outreach action="objective_agent_control" | `manage_outreach` | command="stop_period" |
| manage_outreach action="objective_apply_template" | `manage_outreach` | None |
| manage_outreach action="objective_approve" | `manage_outreach` | None |
| manage_outreach action="objective_business_complete" | `manage_outreach` | None |
| manage_outreach action="objective_clone" | `manage_outreach` | None |
| manage_outreach action="objective_cohort_revise" | `manage_outreach` | None |
| manage_outreach action="objective_create" | `manage_outreach` | None |
| manage_outreach action="objective_delegate" | `manage_outreach` | None |
| manage_outreach action="objective_launch" | `manage_outreach` | None |
| manage_outreach action="objective_members" | `manage_outreach` | action="assign" |
| manage_outreach action="objective_members" | `manage_outreach` | action="unassign" |
| manage_outreach action="objective_observe" | `manage_outreach` | None |
| manage_outreach action="objective_observe_approve" | `manage_outreach` | None |
| manage_outreach action="objective_observe_policy" | `manage_outreach` | None |
| manage_outreach action="objective_opportunity_send" | `manage_outreach` | None |
| manage_outreach action="objective_pause" | `manage_outreach` | None |
| manage_outreach action="objective_pilot_decide" | `manage_outreach` | None |
| manage_outreach action="objective_pilot_prepared" | `manage_outreach` | None |
| manage_outreach action="objective_pilot_refresh" | `manage_outreach` | None |
| manage_outreach action="objective_pin" | `manage_outreach` | None |
| manage_outreach action="objective_research_brief" | `manage_outreach` | None |
| manage_outreach action="objective_retire" | `manage_outreach` | None |
| manage_outreach action="objective_revoke_delegation" | `manage_outreach` | None |
| manage_outreach action="objective_setup_apply" | `manage_outreach` | None |
| manage_outreach action="objective_setup_prepare" | `manage_outreach` | None |
| manage_outreach action="objective_setup_propose" | `manage_outreach` | None |
| manage_outreach action="objective_setup_reject" | `manage_outreach` | None |
| manage_outreach action="objective_source" | `manage_outreach` | None |
| manage_outreach action="objective_source_approve" | `manage_outreach` | None |
| manage_outreach action="objective_sourcing_reconcile" | `manage_outreach` | None |
| manage_outreach action="objective_sourcing_resume" | `manage_outreach` | None |
| manage_outreach action="objective_sourcing_stop" | `manage_outreach` | None |
| manage_outreach action="objective_touch_asset" | `manage_outreach` | None |
| manage_outreach action="objective_unpin" | `manage_outreach` | None |
| manage_outreach action="objective_update" | `manage_outreach` | None |
| manage_outreach action="pause" | `manage_outreach` | None |
| manage_outreach action="plan_override" | `manage_outreach` | None |
| manage_outreach action="recommendation_decision" | `manage_outreach` | decision="accept" |
| manage_outreach action="recommendation_decision" | `manage_outreach` | decision="defer" |
| manage_outreach action="recommendation_decision" | `manage_outreach` | decision="reject" |
| manage_outreach action="resume" | `manage_outreach` | None |
| manage_outreach action="start" | `manage_outreach` | None |
| manage_outreach action="trigger_touch" | `manage_outreach` | None |
| manage_outreach action="update" | `manage_outreach` | None |
| manage_person action="add_position" | `manage_person` | None |
| manage_person action="adopt_directory" | `manage_person` | None |
| manage_person action="archive" | `manage_person` | None |
| manage_person action="create" | `manage_person` | None |
| manage_person action="log_interaction" | `manage_person` | None |
| manage_person action="meeting_booked" | `manage_person` | None |
| manage_person action="note" | `manage_person` | None |
| manage_person action="save_discovered" | `manage_person` | None |
| manage_person action="set_meeting_no_show" | `manage_person` | None |
| manage_person action="set_meeting_purpose" | `manage_person` | None |
| manage_person action="set_persona" | `manage_person` | None |
| manage_person action="set_position" | `manage_person` | None |
| manage_person action="task" | `manage_person` | None |
| manage_person action="unarchive" | `manage_person` | None |
| manage_person action="update_contact" | `manage_person` | None |
| manage_relationship_action action="approve" | `manage_relationship_action` | None |
| manage_relationship_action action="cancel" | `manage_relationship_action` | None |
| manage_relationship_action action="classify_response" | `manage_relationship_action` | None |
| manage_relationship_action action="confirm_external" | `manage_relationship_action` | None |
| manage_relationship_action action="draft" | `manage_relationship_action` | None |
| manage_relationship_action action="edit_draft" | `manage_relationship_action` | None |
| manage_relationship_action action="record_outcome" | `manage_relationship_action` | None |
| manage_revenue action="connect" | `manage_revenue` | None |
| manage_revenue action="decide_binding" | `manage_revenue` | decision="confirmed" |
| manage_revenue action="decide_binding" | `manage_revenue` | decision="rejected" |
| manage_revenue action="disconnect" | `manage_revenue` | None |
| manage_revenue action="disconnect_preview" | `manage_revenue` | None |
| manage_revenue action="reconcile" | `manage_revenue` | None |
| manage_revenue action="replay" | `manage_revenue` | None |
| manage_revenue action="service_margin_statement" | `manage_revenue` | None |
| manage_settings action="auto_fill" | `manage_settings` | None |
| manage_settings action="automation" | `manage_settings` | None |
| manage_settings action="buyer_inquiry_decide" | `manage_settings` | None |
| manage_settings action="cta_link" | `manage_settings` | action="create" |
| manage_settings action="cta_link" | `manage_settings` | action="delete" |
| manage_settings action="cta_link" | `manage_settings` | action="set_default" |
| manage_settings action="cta_link" | `manage_settings` | action="update" |
| manage_settings action="hubspot_backfill" | `manage_settings` | None |
| manage_settings action="hubspot_sync_settings" | `manage_settings` | None |
| manage_settings action="marketing" | `manage_settings` | None |
| manage_settings action="offer_create" | `manage_settings` | None |
| manage_settings action="offer_publish" | `manage_settings` | None |
| manage_settings action="offer_retire" | `manage_settings` | None |
| manage_settings action="offer_update" | `manage_settings` | None |
| manage_settings action="offer_withdraw" | `manage_settings` | None |
| manage_settings action="profile" | `manage_settings` | None |
| manage_settings action="view_save" | `manage_settings` | None |
| manage_settings action="view_update" | `manage_settings` | None |
| query_crm  | `query_crm` | None |
| research action="approve_gaps" | `research` | None |
| research action="cancel_account_brief" | `research` | None |
| research action="enrich" | `research` | None |
| research action="enrich_account" | `research` | None |
| research action="enrich_emails" | `research` | None |
| research action="enrich_person" | `research` | None |
| research action="enrich_profile" | `research` | None |
| research action="find_linkedin" | `research` | None |
| research_lookup action="browser_page" | `research_lookup` | operation="open" |
| research_lookup action="browser_page" | `research_lookup` | operation="scroll" |
| research_lookup action="browser_page" | `research_lookup` | operation="expand" |
| research_lookup action="browser_page" | `research_lookup` | operation="read_page" |
| research_lookup action="browser_page" | `research_lookup` | operation="find" |
| research_lookup action="browser_page" | `research_lookup` | operation="navigate" |
| research_lookup action="browser_page" | `research_lookup` | operation="click" |
| research_lookup action="browser_page" | `research_lookup` | operation="type" |
| research_lookup action="browser_page" | `research_lookup` | operation="select" |
| research_lookup action="browser_page" | `research_lookup` | operation="screenshot" |
| research_lookup action="careers_parse" | `research_lookup` | None |
| research_lookup action="enrich_company" | `research_lookup` | None |
| research_lookup action="find_email" | `research_lookup` | None |
| research_lookup action="linkedin_fetch" | `research_lookup` | None |
| research_lookup action="linkedin_people_search" | `research_lookup` | None |
| research_lookup action="sales_nav_search" | `research_lookup` | None |
| research_lookup action="web_fetch" | `research_lookup` | None |
| research_lookup action="web_search" | `research_lookup` | None |
| research action="preview_gaps" | `research` | None |
| research action="propose_gaps" | `research` | None |
| research action="record_claim_verdict" | `research` | None |
| research action="save_answer" | `research` | None |
| research action="save_claim" | `research` | None |
| research action="save_company" | `research` | None |
| research action="save_evidence" | `research` | None |
| research action="save_person" | `research` | None |
| research action="start_account_brief" | `research` | None |
| research action="stop_gaps" | `research` | None |
| search type="claims" | `search` | None |
| search type="companies" | `search` | None |
| search type="content" | `search` | None |
| search type="cta_links" | `search` | None |
| search type="deals" | `search` | None |
| search type="directory_companies" | `search` | None |
| search type="directory_people" | `search` | None |
| search type="engagements" | `search` | None |
| search type="kb" | `search` | None |
| search type="messages" | `search` | None |
| search type="objectives" | `search` | None |
| search type="people" | `search` | None |
| search type="relationship_attempts" | `search` | None |
| search type="skills" | `search` | None |
| search type="warm_paths" | `search` | None |
| skill action="publish" | `skill` | None |
