// Show welcome if it's the user's first visit
$(function () {
    if (document.cookie === '') {
	$('#welcome-alert').show();
	document.cookie = 'visited';
    }
});
