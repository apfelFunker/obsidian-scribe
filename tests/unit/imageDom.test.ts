/**
 * @jest-environment jsdom
 */
import { addReadingViewAction, refreshImageSources } from '@/imageDom';

describe('image DOM helpers', () => {
  it('reloads every image that shows a file and leaves other images alone', () => {
    document.body.innerHTML = `
      <img id="first" src="app://vault/Bild.png?100">
      <span><img id="second" src="app://vault/Bild.png?200"></span>
      <img id="other" src="app://vault/Anderes.png?100">`;

    expect(refreshImageSources(document, 'app://vault/Bild.png?300', 'v5')).toBe(2);

    expect(document.getElementById('first')?.getAttribute('src')).toBe('app://vault/Bild.png?300&sketch=v5');
    expect(document.getElementById('second')?.getAttribute('src')).toBe('app://vault/Bild.png?300&sketch=v5');
    expect(document.getElementById('other')?.getAttribute('src')).toBe('app://vault/Anderes.png?100');
  });

  it('gives a reading view image one draw button that does not open the image as well', () => {
    document.body.innerHTML = '<div id="section"><span class="internal-embed image-embed"><img src="x.png"></span></div>';
    const embed = document.querySelector<HTMLElement>('.image-embed');
    const onDraw = jest.fn();
    const sectionClick = jest.fn();
    document.getElementById('section')?.addEventListener('click', sectionClick);
    if (!embed) throw new Error('missing embed');

    const button = addReadingViewAction(embed, 'Zeichnen', onDraw);
    expect(addReadingViewAction(embed, 'Zeichnen', onDraw)).toBe(button);
    expect(embed.querySelectorAll('button')).toHaveLength(1);
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Zeichnen');

    button.click();

    expect(onDraw).toHaveBeenCalledTimes(1);
    expect(sectionClick).not.toHaveBeenCalled();
  });
});
