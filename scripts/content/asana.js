/*jslint indent: 2 */
/*global $: false, document: false, togglbutton: false*/

'use strict';

togglbutton.render('.details-pane-body:not(.toggl)', {observe: true}, function (elem) {

  var link,
    container = $('.sticky-view-placeholder', elem),
    description = $('#details_property_sheet_title', elem),
    project = $('#details_pane_project_tokenizer .section-label', elem),
    client = $('#details_pane_project_tokenizer .token_name', elem);

  link = togglbutton.createTimerLink({
    className: 'asana',
    description: description.value,
    projectName: project && project.textContent,
    clientName: client && client.textContent
  });

  container.parentNode.insertBefore(link, container.nextSibling);
});
